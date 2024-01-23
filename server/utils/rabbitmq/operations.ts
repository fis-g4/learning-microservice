import amqplib, { Channel, Connection } from 'amqplib'
import axios from 'axios'
import { Material } from '../../db/models/material'
import { Class } from '../../db/models/class'
import redisClient from '../../db/redis'
import { MaterializedUser, PlanType } from '../../db/models/materializedUsers'

let channel: Channel, connection: Connection
const FIVE_HOURS = 60 * 60 * 5

async function sendMessage(
    dest: string,
    operationId: string,
    API_KEY: string,
    message?: string
) {
    try {
        await axios.post(
            `https://${process.env.API_DOMAIN}/v1/messages/${dest}`,
            {
                operationId,
                message,
            },
            {
                headers: {
                    'x-api-key': API_KEY,
                    'Content-Type': 'application/json',
                },
            }
        )
    } catch (error) {
        console.error(error)
    }
}

async function receiveMessages(queue: string) {
    try {
        const amqpServer = `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBIT_SERVER_IP}:5672`
        connection = await amqplib.connect(amqpServer)
        channel = await connection.createChannel()
        await channel.consume(queue, (data) => {
            console.info(`Received ${Buffer.from(data!.content)}`)
            handleMessages(data!.content.toString())
            channel.ack(data!)
        })
    } catch (error) {
        console.error(error)
    }
}

async function handleMessages(message: string) {
    const jsonMessage = JSON.parse(message)
    const operationId = jsonMessage.operationId
    const messageContent = jsonMessage.message

    switch (operationId) {
        case 'requestAppClassesAndMaterials':
            await handleRequestAppClassesAndMaterials(messageContent)
            break
        case 'publishNewMaterialAccess':
            await handlePublishNewMaterialAccess(messageContent)
            break
        case 'responseMaterialReviews':
            await handleResponseMaterialReviews(messageContent)
            break
        case 'notificationUserDeletion':
            await handleNotificationUserDeletion(messageContent)
            break
        case 'notificationDeleteCourse':
            await handleNotificationDeleteCourse(messageContent)
            break
        case 'responseAppUsers':
            await handleResponseAppUsers(messageContent)
            break
    }
}

async function handleRequestAppClassesAndMaterials(messageContent: any) {
    const courseId = messageContent.courseId

    const classes = await Class.find({ courseId })
    const materials = await Material.find({ courses: courseId })

    const data = {
        courseId,
        classes,
        materials,
    }

    await sendMessage(
        'courses-microservice',
        'responseAppClassesAndMaterials',
        process.env.API_KEY ?? '',
        JSON.stringify(data)
    )
}

async function handlePublishNewMaterialAccess(messageContent: any) {
    const username = messageContent.username
    const materialId = messageContent.materialId

    const material = await Material.findById(materialId)
    if (material) {
        if (!material.purchasers.includes(username)) {
            material.purchasers.push(username)
            await material.save()
        }
    }
}

async function handleResponseMaterialReviews(messageContent: any) {
    const materialId = messageContent.materialId
    const review = messageContent.review
    await redisClient.set(materialId, review, { EX: FIVE_HOURS })
}

async function handleNotificationUserDeletion(messageContent: any) {
    const username = messageContent.username
    const userMaterials = await Material.find({ purchasers: username })
    userMaterials.forEach(async (material) => {
        material.purchasers = material.purchasers.filter(
            (purchaser) => purchaser !== username
        )
        await material.save()
    })
    const ownedMaterials = await Material.find({ author: username })
    ownedMaterials.forEach(async (material) => {
        await material.deleteOne()
    })
    const ownedClasses = await Class.find({ creator: username })
    ownedClasses.forEach(async (_class) => {
        await _class.deleteOne()
    })
}

async function handleNotificationDeleteCourse(messageContent: any) {
    const courseId = messageContent.courseId
    const courseMaterials = await Material.find({ courses: courseId })
    courseMaterials.forEach(async (material) => {
        material.courses = material.courses.filter(
            (course) => course !== courseId
        )
        await material.save()
    })
    const courseClasses = await Class.find({ courseId })
    courseClasses.forEach(async (_class) => {
        await _class.deleteOne()
    })
}

async function handleResponseAppUsers(messageContent: any) {
    function getPlan(plan: any) {
        switch (plan.toUpperCase()) {
            case 'BASIC':
                return PlanType.BASIC
            case 'ADVANCED':
                return PlanType.ADVANCED
            case 'PRO':
                return PlanType.PRO
        }
    }

    const users = messageContent.users
    for (const user of users) {
        const username = user.username
        const email = user.email
        const firstName = user.firstName
        const lastName = user.lastName
        const profilePicture = user.profilePicture
        const plan = getPlan(user.plan)

        const materializedUser = await MaterializedUser.findOne({
            username,
        })
        if (materializedUser) {
            materializedUser.email = email
            materializedUser.firstName = firstName
            materializedUser.lastName = lastName
            materializedUser.profilePicture = profilePicture
            materializedUser.plan = plan
            materializedUser.insertDate = new Date()
            await materializedUser.save()
        } else {
            const newMaterializedUser = MaterializedUser.build({
                username,
                email,
                firstName,
                lastName,
                profilePicture,
                plan,
            })
            await newMaterializedUser.save()
        }
    }
}

export { receiveMessages, sendMessage }

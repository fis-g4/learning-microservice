import amqplib, { Channel, Connection } from 'amqplib'
import axios from 'axios'
import { Material } from '../db/models/material'
import { Class } from '../db/models/class'
import redisClient from '../db/redis'

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
    if (operationId === 'requestAppClassesAndMaterials') {
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
    } else if (operationId === 'publishNewMaterialAccess') {
        const username = messageContent.username
        const materialId = messageContent.materialId

        const material = await Material.findById(materialId)
        if (material) {
            if (!material.purchasers.includes(username)) {
                material.purchasers.push(username)
                await material.save()
            }
        }
    } else if (operationId === 'responseMaterialReviews') {
        const materialId = messageContent.materialId
        const review = messageContent.review
        await redisClient.set(materialId, review, { EX: FIVE_HOURS })
    } else if (operationId === 'notificationUserDeletion') {
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
    } else if (operationId === 'notificationDeleteCourse') {
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
    } else if (operationId === 'responseAppUsers') {
        const users = messageContent.users
        // Each user has a firstName,lastName,username,email,profilePicture,plan
    }
}

export { receiveMessages, sendMessage }

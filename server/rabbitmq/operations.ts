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
        const amqpServer = `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}@34.155.59.118:5672` // TODO: CHANGE TO API_DOMAIN
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
        const classIds = messageContent.classIds
        const materialIds = messageContent.materialIds

        const classes = await Class.find({ _id: { $in: classIds } })

        const materials = await Material.find({
            _id: { $in: materialIds },
        })

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
    } else if (operationId === 'publishNewAccess') {
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
    }
}

export { receiveMessages, sendMessage }

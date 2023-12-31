import amqplib, { Channel, Connection } from 'amqplib'
import axios from 'axios'
import { Material } from '../db/models/material'
import { Class } from '../db/models/class'

let channel: Channel, connection: Connection

async function sendMessage(
    dest: string,
    operationId: string,
    API_KEY: string,
    message?: string
) {
    try {
        await axios.post(
            `http://${process.env.COMMUNICATION_MICROSERVICE_HOST}:8080/api/v1/messages/${dest}`,
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
        const amqpServer = `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}@rabbitmq:5672`
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
    if (operationId === 'requestAppClassesAndMaterials') {
        const courseId = jsonMessage.courseId
        const classesIds = jsonMessage.classesIds
        const materialIds = jsonMessage.materialIds

        const classes = await Class.findAll({
            where: {
                id: classesIds,
            },
        })

        const materials = await Material.findAll({
            where: {
                id: materialIds,
            },
        })

        const data = {
            courseId,
            classes,
            materials,
        }

        sendMessage(
            'courses-microservice',
            'responseAppClassesAndMaterials',
            process.env.API_KEY ?? '',
            JSON.stringify(data)
        )
    } else if (operationId === 'publishNewAccess') {
        const username = jsonMessage.username
        const materialId = jsonMessage.materialId

        const material = await Material.findByPk(materialId)
        if (material) {
            const purchasers = material.purchasers
            purchasers.push(username)
            await material.update({ purchasers })
        }
    } else if (operationId === 'responseMaterialReviews') {
        const materialId = jsonMessage.materialId
        const review = jsonMessage.review
        // TODO: CACHE
    }
}

export { receiveMessages, sendMessage }

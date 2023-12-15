import amqplib, { Channel, Connection } from 'amqplib'
import axios from 'axios'

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
        sendMessage(
            'courses-microservice',
            'responseAppClassesAndMaterials',
            process.env.API_KEY ?? '',
            'Response from learning microservice' //TODO: get data from database
        )
    }
}

export { receiveMessages, sendMessage }

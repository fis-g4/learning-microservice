import { redis } from './config'
import { createClient } from 'redis'

const redisURL = `redis://:${redis.password}@${redis.host}:${redis.port}`

const client = createClient({ url: redisURL })

client.on('connect', () => console.info('Cache is connecting'))
client.on('ready', () => console.info('Cache is ready'))
client.on('end', () => console.info('Cache disconnected'))
client.on('reconnecting', () => console.info('Cache is reconnecting'))
client.on('error', (e) => console.error(e))
;(async () => {
    await client.connect()
})()

process.on('SIGINT', async () => {
    await client.disconnect()
})

export default client

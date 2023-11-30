import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import classes from './routes/classes'
import users from './routes/users'
import materials from './routes/materials'
import './loadEnvironment'
import './db/conn'

const app: Express = express()
const API_VERSION = '/api/v1'

app.use(express.json())
app.use(cors())

app.get(API_VERSION, (req: Request, res: Response) => {
    res.send('Hello World From the Typescript Server!')
})

const port = process.env.PORT ?? 8000

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})

app.use(API_VERSION + '/users', users)
app.use(API_VERSION + '/materials', materials)
app.use(API_VERSION + '/classes', classes)

module.exports = app

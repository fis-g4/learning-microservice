import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import classes from './routes/classes'
import users from './routes/users'
import materials from './routes/materials'
import { generateToken, verifyToken } from './utils/jwtUtils'

const app: Express = express()
const API_VERSION = '/v1'

app.use(express.json())
app.use(cors())

const URLS_ALLOWED_WITHOUT_TOKEN = ['/v1/materials/check', '/v1/classes/check']

app.use((req, res, next) => {
    let decodedToken = verifyToken(
        req,
        res,
        URLS_ALLOWED_WITHOUT_TOKEN.includes(req.path)
    )

    if (decodedToken !== undefined) {
        res.setHeader(
            'Authorization',
            `Bearer ${generateToken(decodedToken as object, res)}`
        )
    } else if (res.statusCode !== 200) {
        return res
    }

    next()
})

app.get(API_VERSION, (req: Request, res: Response) => {
    res.send('Hello World From the Typescript Server!')
})

const port = process.env.PORT ?? 8000

app.use(API_VERSION + '/users', users)
app.use(API_VERSION + '/materials', materials)

app.use((err: any, req: any, res: any, next: any) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send({
            error: 'File ocuppied more than 5MB',
        })
    }
})



app.use(API_VERSION + '/classes', classes)

app.use((err: any, req: any, res: any, next: any) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send({
            error: 'Video file ocuppied more than 1GB',
        })
    }
})

module.exports = app

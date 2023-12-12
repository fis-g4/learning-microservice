import express, { Request, Response } from 'express'
import { User } from '../db/models/user'

const router = express.Router()

router.get('/', async (req: Request, res: Response) => {
    const users = await User.find({})

    return res.status(200).json(users)
})

router.post('/login', async (req: Request, res: Response) => {
    const { email, password }: FormInputs = req.body

    const user = await User.findOne({ email, password })

    if (!user) {
        return res.status(404).send('User Not Found!')
    }

    return res.status(200).json(user)
})

router.post('/', async (req: Request, res: Response) => {
    const { email, password, username }: FormInputs = req.body

    let name = 'Test User'

    const user = User.build({
        name: name,
        username: username,
        email: email,
        password: password,
    })

    await user.save()

    return res.status(201).json(user)
})

export default router

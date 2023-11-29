import express, { Request, Response } from 'express'
import { Material } from '../db/models/material'
import mongoose from 'mongoose'

const router = express.Router()

router.get('/me', async (req: Request, res: Response) => {
    //Default Author/userId
    //TODO: Change to logged user
    const userId = new mongoose.Types.ObjectId('60d5ecb44b930ac130e82d7e')

    await Material.find({ author: userId }).then((materials) => {
        res.status(200).json(materials)
    })
})

router.get('/:id', async (req: Request, res: Response) => {
    //TODO: Check if user has access to material
    const material = await Material.findById(req.params.id)
    if (material) {
        return res.status(200).json(material)
    }
    return res.status(404).json({ error: 'Material not found' })
})

router.get('/:id/users', async (req: Request, res: Response) => {
    //TODO: Check if user that is requesting is the author of the material
    const material = await Material.findById(req.params.id)
    if (material) {
        //TODO: Return the users information
        return res.status(200).json({ purchasers: material.purchasers })
    }
    return res.status(404).json({ error: 'Material not found' })
})

router.post('/', async (req: Request, res: Response) => {
    const { title, description, price, file, type }: MaterialInputs = req.body

    if (!title || !description || !price || !file || !type) {
        return res.status(400).json({
            error: 'Missing required fields (title, description, price, file, type)',
        })
    }

    //TODO: Change to logged user
    //const author = req.user ? res.user.id : null;
    const author = new mongoose.Types.ObjectId('60d5ecb44b930ac130e82d7e')

    const newMaterial = Material.build({
        title,
        description,
        price,
        author,
        purchasers: [],
        file,
        type,
    })

    const savedMaterial = await newMaterial.save()

    res.status(201).json(savedMaterial)
})

router.put('/:id', async (req: Request, res: Response) => {
    //TODO: Check if user is the author of the material
    const material = await Material.findById(req.params.id)

    if (!material) {
        return res.status(404).json({ error: 'Material not found' })
    }

    const {
        title,
        description,
        price,
        file,
        type,
        purchasers,
    }: MaterialInputs = req.body

    if (!title && !description && !price && !file && !type && !purchasers) {
        return res.status(400).json({ error: 'No fields to update provided' })
    }
    


    if (title) material.title = title
    if (description) material.description = description
    if (price) material.price = price
    if (file) material.file = file
    if (type) material.type = type
    if (purchasers) material.purchasers = purchasers

    const updatedMaterial = await material.save()

    return res.status(200).json(updatedMaterial)
})

router.delete('/:id', async (req: Request, res: Response) => {
    //TODO: Check if user is the author of the material
    const material = await Material.findById(req.params.id)
    if (!material) {
        return res.status(404).json({ error: 'Material not found' })
    }

    await material.deleteOne()
    return res.status(200).send('Material deleted successfully')
})

export default router

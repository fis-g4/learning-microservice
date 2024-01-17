import express, { Request, Response } from 'express'
import { IUser, getPayloadFromToken } from '../utils/jwtUtils'

import { Material, MaterialDoc } from '../db/models/material'

import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { Storage } from '@google-cloud/storage'
import { sendMessage } from '../rabbitmq/operations'
import redisClient from '../db/redis'

const router = express.Router()

const storage = new Storage({
    keyFilename: './GoogleCloudKey.json',
})
const bucketName = 'materials-bucket'
const bucket = storage.bucket(bucketName)

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
})

function getFileNameFromUrl(url: string): string | null {
    const match = url.match(/\/([^\/?#]+)[^\/]*$/)
    return match ? match[1] : null
}

// ------------------------ GET ROUTES ------------------------

router.get('/', async (req: Request, res: Response) => {
    try {
        let decodedToken: IUser = getPayloadFromToken(req)
        const username: string = decodedToken.username

        if (!username) {
            return res
                .status(401)
                .json({ error: 'Unauthenticated: You are not logged in' })
        }

        await Material.find({}).then((materials) => {
            res.status(200).send(materials.map((material) => material.toJSON()))
        })
    } catch (error) {
        return res.status(500).send()
    }
})

router.get('/me', async (req: Request, res: Response) => {
    try {
        let decodedToken: IUser = getPayloadFromToken(req)
        const username: string = decodedToken.username

        if (!username) {
            return res
                .status(401)
                .json({ error: 'Unauthenticated: You are not logged in' })
        }

        await Material.find({ author: username }).then((materials) => {
            res.status(200).send(materials.map((material) => material.toJSON()))
        })
    } catch (error) {
        return res.status(500).send()
    }
})

router.get('/:id', async (req: Request, res: Response) => {
    try {
        let decodedToken: IUser = getPayloadFromToken(req)
        const username: string = decodedToken.username
        if (!username) {
            return res
                .status(401)
                .json({ error: 'Unauthenticated: You are not logged in' })
        }
        const materialId = req.params.id
        const material = await Material.findById(materialId)
        if (!material) {
            return res.status(404).json({ error: 'Material not found' })
        }
        if (
            material.author === username ||
            material.price === 0 ||
            material.purchasers.includes(username)
        ) {
            let materialReview = null
            await redisClient.exists(materialId).then(async (exists) => {
                if (exists === 1) {
                    await redisClient.get(materialId).then((reply) => {
                        materialReview = reply
                    })
                } else {
                    const message = JSON.stringify({
                        materialId,
                    })
                    await sendMessage(
                        'reviews-microservice',
                        'requestMaterialReviews',
                        process.env.API_KEY ?? '',
                        message
                    )
                }
            })

            const materialJSON: Record<string, any> = material.toJSON()
            materialJSON['review'] = materialReview
            return res.status(200).json(materialJSON)
        }
        return res.status(403).json({
            error: 'Unauthorized: You are not the author of this material or you have not purchased it',
        })
    } catch (error) {
        return res.status(500).send()
    }
})

router.get('/:id/users', async (req: Request, res: Response) => {
    try {
        let decodedToken: IUser = getPayloadFromToken(req)
        const username: string = decodedToken.username
        if (!username) {
            return res
                .status(401)
                .json({ error: 'Unauthenticated: You are not logged in' })
        }
        const material = await Material.findById(req.params.id)
        if (!material) {
            return res.status(404).json({ error: 'Material not found' })
        }
        if (material.author === username) {
            return res.status(200).json({ purchasers: material.purchasers })
        }
        return res.status(403).json({
            error: 'Unauthorized: You are not the author of this material',
        })
    } catch (error) {
        return res.status(500).send()
    }
})

// ------------------------ POST ROUTES ------------------------

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
    try {
        let decodedToken: IUser = getPayloadFromToken(req)
        const username: string = decodedToken.username

        if (!username) {
            return res
                .status(401)
                .json({ error: 'Unauthenticated: You are not logged in' })
        }

        const { title, description, price, currency, type }: MaterialInputs =
            req.body

        if (
            !title ||
            !description ||
            !price ||
            !currency ||
            !req.file ||
            !type
        ) {
            return res.status(400).json({
                error: 'Missing required fields: title, description, price, currency (EUR or USD), file, type (book, article, presentation or exercises)',
            })
        }
        const newMaterial: MaterialDoc = Material.build({
            title,
            description,
            price,
            author: username,
            purchasers: [],
            currency,
            file: 'dummy',
            type,
        })

        let savedMaterial: MaterialDoc

        try {
            savedMaterial = await newMaterial.save()
        } catch (err: any) {
            return res
                .status(400)
                .json({ error: err.message ?? 'Invalid data' })
        }

        const blob = bucket.file(`${uuidv4()}-${req.file.originalname}`)
        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: req.file.mimetype,
            },
        })

        blobStream.on('error', async (err) => {
            await Material.deleteOne({ _id: savedMaterial._id })
            return res.status(500).send()
        })

        blobStream.on('finish', async () => {
            const publicUrl: string = `https://storage.googleapis.com/${bucketName}/${blob.name}`
            savedMaterial.file = publicUrl
            await savedMaterial.save()
            return res
                .status(201)
                .json({ message: 'Material created successfully' })
        })
        blobStream.end(req.file.buffer)
    } catch (error) {
        return res.status(500).send()
    }
})

router.post(
    '/:id/course/:courseId/associate',
    async (req: Request, res: Response) => {
        const data = {
            courseId: req.params.courseId,
            classId: req.params.id,
        }
        await sendMessage(
            'courses-microservice',
            'notificationAssociateMaterial',
            process.env.API_KEY ?? '',
            JSON.stringify(data)
        )
        return res.status(204).send()
    }
)

router.post(
    '/:id/course/:courseId/disassociate',
    async (req: Request, res: Response) => {
        const data = {
            courseId: req.params.courseId,
            classId: req.params.id,
        }
        await sendMessage(
            'courses-microservice',
            'notificationDisassociateMaterial',
            process.env.API_KEY ?? '',
            JSON.stringify(data)
        )
        return res.status(204).send()
    }
)

// ------------------------ PUT ROUTES ------------------------

router.put(
    '/:id',
    upload.single('file'),
    async (req: Request, res: Response) => {
        try {
            let decodedToken: IUser = getPayloadFromToken(req)
            const username: string = decodedToken.username
            if (!username) {
                return res
                    .status(401)
                    .json({ error: 'Unauthenticated: You are not logged in' })
            }
            const material = await Material.findById(req.params.id)
            if (!material) {
                return res.status(404).json({ error: 'Material not found' })
            }

            if (material.author !== username) {
                return res.status(403).json({
                    error: 'Unauthorized: You are not the author of this material',
                })
            }

            const {
                title,
                description,
                price,
                currency,
                type,
                purchasers,
            }: MaterialInputs = req.body

            if (
                !title &&
                !description &&
                !price &&
                !currency &&
                !req.file &&
                !type &&
                !purchasers
            ) {
                return res
                    .status(400)
                    .json({ error: 'No fields to update provided' })
            }

            if (req.file) {
                if (title) material.title = title
                if (description) material.description = description
                if (price) material.price = price
                if (currency) material.currency = currency
                if (purchasers) material.purchasers = purchasers
                if (type) material.type = type

                let updatedMaterial: MaterialDoc
                try {
                    updatedMaterial = await material.save()
                } catch (err: any) {
                    return res
                        .status(400)
                        .json({ error: err.message ?? 'Invalid data' })
                }
                const newFileName = `${uuidv4()}-${req.file.originalname}`
                const blob = bucket.file(newFileName)

                const blobStream = blob.createWriteStream({
                    metadata: {
                        contentType: req.file.mimetype,
                    },
                })

                blobStream.on('error', (err) => {
                    return res.status(500).send()
                })

                blobStream.on('finish', async () => {
                    if (material.file) {
                        const oldFileName = getFileNameFromUrl(material.file)
                        if (oldFileName) {
                            await bucket.file(oldFileName).delete()
                        }
                    }
                    const publicUrl: string = `https://storage.googleapis.com/${bucketName}/${blob.name}`
                    updatedMaterial.file = publicUrl
                    const updatedMaterialWithFile: MaterialDoc =
                        await updatedMaterial.save()
                    return res
                        .status(200)
                        .json(updatedMaterialWithFile.toJSON())
                })

                blobStream.end(req.file.buffer)
            } else {
                if (title) material.title = title
                if (description) material.description = description
                if (price) material.price = price
                if (currency) material.currency = currency
                if (purchasers) material.purchasers = purchasers
                if (type) material.type = type

                let updatedMaterial: MaterialDoc
                try {
                    updatedMaterial = await material.save()
                } catch (err: any) {
                    return res
                        .status(400)
                        .json({ error: err.message ?? 'Invalid data' })
                }
                return res.status(200).json(updatedMaterial.toJSON())
            }
        } catch (error) {
            return res.status(500).send()
        }
    }
)

// ------------------------ DELETE ROUTES ------------------------

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        let decodedToken: IUser = getPayloadFromToken(req)
        const username: string = decodedToken.username
        if (!username) {
            return res
                .status(401)
                .json({ error: 'Unauthenticated: You are not logged in' })
        }
        const material = await Material.findById(req.params.id)
        if (!material) {
            return res.status(404).json({ error: 'Material not found' })
        }

        if (material.author !== username) {
            return res.status(403).json({
                error: 'Unauthorized: You are not the author of this material',
            })
        }

        const fileUrl: string = material.file
        const fileName = fileUrl.split('/').pop()

        if (fileName !== undefined) {
            await bucket.file(fileName).delete()
        }
        await Material.deleteOne({ _id: material._id })
        const data = {
            classId: req.params.id,
        }
        await sendMessage(
            'courses-microservice',
            'notificationNewClass',
            process.env.API_KEY ?? '',
            JSON.stringify(data)
        )
        return res.status(204).send()
    } catch (error) {
        return res.status(500).send()
    }
})

export default router

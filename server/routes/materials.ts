import express, { Request, Response } from 'express'
import {
    IUser,
    getPayloadFromToken,
    getTokenFromRequest,
} from '../utils/jwtUtils'

import { Material, MaterialDoc } from '../db/models/material'

import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { Storage } from '@google-cloud/storage'
import { sendMessage } from '../rabbitmq/operations'
import redisClient from '../db/redis'

import mongoose from 'mongoose'

const router = express.Router()

const storage = new Storage({
    keyFilename: '../GoogleCloudKey.json',
})
const bucketName = process.env.MATERIAL_BUCKET ?? 'materials-bucket'
const bucket = storage.bucket(bucketName)

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024,
    },
})

function getFileNameFromUrl(url: string): string | null {
    const match = url.match(/\/([^\/?#]+)[^\/]*$/)
    return match ? match[1] : null
}

async function getUsedSpace(username: string): Promise<number> {
    try {
        const files = await bucket.getFiles()

        let usedSpace = 0

        files[0].forEach((file: any) => {
            const regex = new RegExp(`^${username}-`)
            if (file.name.match(regex)) {
                usedSpace += file.metadata.size
            }
        })

        return usedSpace
    } catch (error) {
        return 0
    }
}

async function canUpload(
    username: string,
    plan: string,
    newFileSize: number
): Promise<boolean> {
    const usedSpace = await getUsedSpace(username)

    if (plan === 'FREE') {
        return (
            usedSpace + newFileSize < 5 * 1024 * 1024 * 1024 &&
            newFileSize <= getPlanUploadLimit(plan)
        )
    } else if (plan === 'PREMIUM') {
        return (
            usedSpace + newFileSize < 12 * 1024 * 1024 * 1024 &&
            newFileSize <= getPlanUploadLimit(plan)
        )
    } else if (plan === 'PRO') {
        return (
            usedSpace + newFileSize < 25 * 1024 * 1024 * 1024 &&
            newFileSize <= getPlanUploadLimit(plan)
        )
    } else {
        return false
    }
}

function getPlanUploadLimit(plan: string): number {
    switch (plan) {
        case 'FREE':
            return 5 * 1024 * 1024
        case 'PREMIUM':
            return 10 * 1024 * 1024
        case 'PRO':
            return 20 * 1024 * 1024
        default:
            return 0 // Valor predeterminado, ajusta según tus necesidades
    }
}

async function generateSignedUrls(publicUrl: string): Promise<any> {
    try {
        const [url] = await storage
            .bucket(bucketName)
            .file(publicUrl)
            .getSignedUrl({
                action: 'read',
                expires: Date.now() + 12 * 60 * 60 * 1000,
            })

        return { readUrl: url }
    } catch {
        return { readUrl: publicUrl }
    }
}

// ------------------------ GET ROUTES ------------------------

router.get('/check', async (req: Request, res: Response) => {
    return res
        .status(200)
        .json({ message: 'The materials service is working properly!' })
})

router.get('/', async (req: Request, res: Response) => {
    try {
        let decodedToken: IUser = await getPayloadFromToken(
            getTokenFromRequest(req) ?? ''
        )
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
        let decodedToken: IUser = await getPayloadFromToken(
            getTokenFromRequest(req) ?? ''
        )
        const username: string = decodedToken.username

        if (!username) {
            return res
                .status(401)
                .json({ error: 'Unauthenticated: You are not logged in' })
        }

        const materials = await Material.find({ author: username })

        for (const material of materials) {
            const publicUrl: string = material.file
            const signedUrls = await generateSignedUrls(publicUrl)
            material.file = signedUrls
        }

        res.status(200).json(materials.map((material) => material.toJSON()))
    } catch (error) {
        return res.status(500).send()
    }
})

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const idParameter = req.params.id
        if (!mongoose.Types.ObjectId.isValid(idParameter)) {
            return res.status(400).json({ error: 'Invalid ID format' })
        }

        let decodedToken: IUser = await getPayloadFromToken(
            getTokenFromRequest(req) ?? ''
        )
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

        const publicUrl: string = material.file

        const signedUrls = await generateSignedUrls(publicUrl)
        material.file = signedUrls

        if (
            material.author === username ||
            material.price === 0 ||
            material.purchasers.includes(username)
        ) {
            let materialReview = null
            await redisClient.exists(materialId).then(async (exists: any) => {
                if (exists === 1) {
                    await redisClient.get(materialId).then((reply: any) => {
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
        const idParameter = req.params.id
        if (!mongoose.Types.ObjectId.isValid(idParameter)) {
            return res.status(400).json({ error: 'Invalid ID format' })
        }

        let decodedToken: IUser = await getPayloadFromToken(
            getTokenFromRequest(req) ?? ''
        )
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
        let decodedToken: IUser = await getPayloadFromToken(
            getTokenFromRequest(req) ?? ''
        )
        const username: string = decodedToken.username
        const plan = decodedToken.plan

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
        if (!(await canUpload(username, plan, req.file.size))) {
            return res.status(403).json({
                error: 'Unauthorized: You have exceeded your storage limit',
            })
        }
        try {
            savedMaterial = await newMaterial.save()
        } catch (err: any) {
            return res
                .status(400)
                .json({ error: err.message ?? 'Invalid data' })
        }
        // const blob = bucket.file(`${uuidv4()}-${req.file.originalname}`)
        const blob = bucket.file(
            `${username}-${uuidv4()}-${req.file.originalname}`
        )
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
            const idParameter = req.params.id
            if (!mongoose.Types.ObjectId.isValid(idParameter)) {
                return res.status(400).json({ error: 'Invalid ID format' })
            }

            let decodedToken: IUser = await getPayloadFromToken(
                getTokenFromRequest(req) ?? ''
            )
            const username: string = decodedToken.username
            const plan: string = decodedToken.plan
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
                if (!(await canUpload(username, plan, req.file.size))) {
                    return res.status(403).json({
                        error: 'Unauthorized: You have exceeded your storage limit',
                    })
                }
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
                // const newFileName = `${uuidv4()}-${req.file.originalname}`
                const newFileName = `${username}-${uuidv4()}-${
                    req.file.originalname
                }`

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
        const idParameter = req.params.id
        if (!mongoose.Types.ObjectId.isValid(idParameter)) {
            return res.status(400).json({ error: 'Invalid ID format' })
        }
        let decodedToken: IUser = await getPayloadFromToken(
            getTokenFromRequest(req) ?? ''
        )
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

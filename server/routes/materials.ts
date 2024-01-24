import express, { Request, Response } from 'express'
import {
    IUser,
    getPayloadFromToken,
    getTokenFromRequest,
} from '../utils/jwtUtils'

import { Material, MaterialDoc } from '../db/models/material'
import { MaterializedUser, PlanType } from '../db/models/materializedUsers'

import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { Storage } from '@google-cloud/storage'
import { sendMessage } from '../utils/rabbitmq/operations'
import redisClient from '../db/redis'

import {
    canUpload,
    generateSignedUrl,
    getFileNameFromUrl,
} from '../utils/googleCloud/storage'
import { getUsersToRequest } from '../utils/users/materializedView'
import { authUser } from '../utils/auth/auth'
import { handleError, isValidObjectId } from '../utils/routes/auxFunctions'
import { getCourseById } from '../utils/mocks/courses'

const router = express.Router()

// Storage configuration

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

// ------------------------ GET ROUTES ------------------------

router.get('/check', async (req: Request, res: Response) => {
    return res
        .status(200)
        .json({ message: 'The materials service is working properly!' })
})

router.get('/me', authUser, async (req: Request, res: Response) => {
    try {
        let decodedToken: IUser = await getPayloadFromToken(
            getTokenFromRequest(req) ?? ''
        )
        const username: string = decodedToken.username

        const materials = await Material.find({ author: username })

        for (const material of materials) {
            const publicUrl: string = material.file
            const signedUrl = await generateSignedUrl(
                publicUrl,
                bucketName,
                storage
            )
            material.file = signedUrl.readUrl
        }

        res.status(200).json(materials.map((material) => material.toJSON()))
    } catch (error) {
        handleError(res, error)
    }
})

router.get('/:id', authUser, async (req: Request, res: Response) => {
    try {
        const idParameter = req.params.id
        if (!isValidObjectId(idParameter, res)) {
            return
        }

        let decodedToken: IUser = await getPayloadFromToken(
            getTokenFromRequest(req) ?? ''
        )
        const username: string = decodedToken.username

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
            const publicUrl: string = material.file

            const signedUrl = await generateSignedUrl(
                publicUrl,
                bucketName,
                storage
            )
            material.file = signedUrl.readUrl

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
                        'courses-microservice',
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
        handleError(res, error)
    }
})

router.get('/:id/users', authUser, async (req: Request, res: Response) => {
    try {
        const idParameter = req.params.id
        if (!isValidObjectId(idParameter, res)) {
            return
        }
        let decodedToken: IUser = await getPayloadFromToken(
            getTokenFromRequest(req) ?? ''
        )
        const username: string = decodedToken.username
        const material = await Material.findById(req.params.id)
        if (!material) {
            return res.status(404).json({ error: 'Material not found' })
        }
        if (material.author === username) {
            const usernamesToRequest = await getUsersToRequest(
                material.purchasers
            )
            if (usernamesToRequest.length > 0) {
                const message = JSON.stringify({
                    usernames: usernamesToRequest,
                })
                await sendMessage(
                    'users-microservice',
                    'requestAppUsers',
                    process.env.API_KEY ?? '',
                    message
                )
            }

            let _res: any = []

            const storedUsers = material.purchasers.filter(
                (item) => !usernamesToRequest.includes(item)
            )

            for (const username of storedUsers) {
                const user = await MaterializedUser.findOne({ username })
                _res.push({
                    username,
                    firstName: user?.firstName ?? '',
                    lastName: user?.lastName ?? '',
                    email: user?.email ?? '',
                    profilePicture: user?.profilePicture ?? '',
                    plan: user?.plan ?? PlanType.BASIC,
                })
            }

            usernamesToRequest.forEach((username) => {
                _res.push({
                    username,
                    firstName: '',
                    lastName: '',
                    email: '',
                    profilePicture: '',
                    plan: PlanType.BASIC,
                })
            })

            return res.status(200).json({ purchasers: _res })
        }
        return res.status(403).json({
            error: 'Unauthorized: You are not the author of this material',
        })
    } catch (error) {
        handleError(res, error)
    }
})

router.get(
    '/course/:courseId',
    authUser,
    async (req: Request, res: Response) => {
        try {
            const courseId = req.params.courseId

            // Mock course
            const course = await getCourseById(courseId)

            if (!course) {
                return res.status(404).json({ error: 'Course not found' })
            }

            let decodedToken: IUser = await getPayloadFromToken(
                getTokenFromRequest(req) ?? ''
            )
            const username: string = decodedToken.username
            const materials = await Material.find({
                courses: req.params.courseId,
            })

            for (const material of materials) {
                if (
                    material.price === 0 ||
                    material.purchasers.includes(username) ||
                    material.author === username
                ) {
                    const publicUrl: string = material.file
                    const signedUrl = await generateSignedUrl(
                        publicUrl,
                        bucketName,
                        storage
                    )
                    material.file = signedUrl.readUrl
                }
            }

            res.status(200).json(materials.map((material) => material.toJSON()))
        } catch (error) {
            handleError(res, error)
        }
    }
)

// ------------------------ POST ROUTES ------------------------

router.post(
    '/',
    authUser,
    upload.single('file'),
    async (req: Request, res: Response) => {
        try {
            let decodedToken: IUser = await getPayloadFromToken(
                getTokenFromRequest(req) ?? ''
            )
            const username: string = decodedToken.username
            const plan = decodedToken.plan

            const {
                title,
                description,
                price,
                currency,
                type,
            }: MaterialInputs = req.body

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
                courses: [],
                currency,
                file: 'dummy',
                type,
            })

            let savedMaterial: MaterialDoc
            const canUploadResult = await canUpload(
                username,
                plan,
                req.file.size,
                bucket,
                'material'
            )

            if (!canUploadResult.success) {
                return res.status(403).json({
                    error: canUploadResult.message,
                })
            }
            try {
                savedMaterial = await newMaterial.save()
            } catch (err: any) {
                return res
                    .status(400)
                    .json({ error: err.message ?? 'Invalid data' })
            }

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
                const publicUrl: string = `${blob.name}`
                savedMaterial.file = publicUrl
                await savedMaterial.save()
                return res
                    .status(201)
                    .json({ message: 'Material created successfully' })
            })
            blobStream.end(req.file.buffer)
        } catch (error) {
            handleError(res, error)
        }
    }
)

router.post(
    '/:id/course/:courseId/associate',
    authUser,
    async (req: Request, res: Response) => {
        try {
            let decodedToken: IUser = await getPayloadFromToken(
                getTokenFromRequest(req) ?? ''
            )
            const username: string = decodedToken.username
            const material = await Material.findById(req.params.id)
            if (!material) {
                return res.status(404).json({ error: 'Material not found' })
            }

            if (material.author !== username) {
                return res.status(403).json({
                    error: 'Unauthorized: You are not the author of this material',
                })
            }

            const data = {
                courseId: req.params.courseId,
                materialId: req.params.id,
            }
            await sendMessage(
                'courses-microservice',
                'notificationAssociateMaterial',
                process.env.API_KEY ?? '',
                JSON.stringify(data)
            )
            return res.status(204).send()
        } catch (error) {
            handleError(res, error)
        }
    }
)

router.post(
    '/:id/course/:courseId/disassociate',
    authUser,
    async (req: Request, res: Response) => {
        try {
            let decodedToken: IUser = await getPayloadFromToken(
                getTokenFromRequest(req) ?? ''
            )
            const username: string = decodedToken.username
            const material = await Material.findById(req.params.id)
            if (!material) {
                return res.status(404).json({ error: 'Material not found' })
            }

            if (material.author !== username) {
                return res.status(403).json({
                    error: 'Unauthorized: You are not the author of this material',
                })
            }

            const data = {
                courseId: req.params.courseId,
                materialId: req.params.id,
            }
            await sendMessage(
                'courses-microservice',
                'notificationDisassociateMaterial',
                process.env.API_KEY ?? '',
                JSON.stringify(data)
            )
            return res.status(204).send()
        } catch (error) {
            handleError(res, error)
        }
    }
)

// ------------------------ PUT ROUTES ------------------------

router.put(
    '/:id',
    upload.single('file'),
    async (req: Request, res: Response) => {
        try {
            const idParameter = req.params.id
            if (!isValidObjectId(idParameter, res)) {
                return
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
                const canUploadResult = await canUpload(
                    username,
                    plan,
                    req.file.size,
                    bucket,
                    'material'
                )

                if (!canUploadResult.success) {
                    return res.status(403).json({
                        error: canUploadResult.message,
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
                    const publicUrl: string = `${blob.name}`
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
            handleError(res, error)
        }
    }
)

// ------------------------ DELETE ROUTES ------------------------

router.delete('/:id', authUser, async (req: Request, res: Response) => {
    try {
        const idParameter = req.params.id
        if (!isValidObjectId(idParameter, res)) {
            return
        }
        let decodedToken: IUser = await getPayloadFromToken(
            getTokenFromRequest(req) ?? ''
        )
        const username: string = decodedToken.username

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
            'notificationDisassociateMaterial',
            process.env.API_KEY ?? '',
            JSON.stringify(data)
        )
        return res.status(204).send()
    } catch (error) {
        handleError(res, error)
    }
})

export default router

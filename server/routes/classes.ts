import express, { Request, Response } from 'express'
import { Class, ClassDoc } from '../db/models/class'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { Storage } from '@google-cloud/storage'
import { authUser } from '../utils/auth/auth'
import { sendMessage } from '../rabbitmq/operations'
import mongoose from 'mongoose'
import {
    IUser,
    getPayloadFromToken,
    getTokenFromRequest,
} from '../utils/jwtUtils'

const router = express.Router()
const storage = new Storage({
    keyFilename: '../GoogleCloudKey.json',
})

const bucketName = process.env.CLASSES_BUCKET ?? 'classes-bucket'
const bucket = storage.bucket(bucketName)

const ERROR_CLASS_NOT_FOUND = 'Class not found'
const ERROR_SERVER = 'Internal Server Error'

const allowedMimeTypes = ['video/mp4', 'video/mpeg', 'video/quicktime']

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024,
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
            usedSpace + newFileSize < 15 * 1024 * 1024 * 1024 &&
            newFileSize <= getPlanUploadLimit(plan)
        )
    } else if (plan === 'PREMIUM') {
        return (
            usedSpace + newFileSize < 38 * 1024 * 1024 * 1024 &&
            newFileSize <= getPlanUploadLimit(plan)
        )
    } else if (plan === 'PRO') {
        return (
            usedSpace + newFileSize < 75 * 1024 * 1024 * 1024 &&
            newFileSize <= getPlanUploadLimit(plan)
        )
    } else {
        return false
    }
}

function getPlanUploadLimit(plan: string): number {
    switch (plan) {
        case 'FREE':
            return 1 * 1024 * 1024 * 1024
        case 'PREMIUM':
            return 2 * 1024 * 1024 * 1024
        case 'PRO':
            return 5 * 1024 * 1024 * 1024
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

router.get('/check', async (req: Request, res: Response) => {
    return res
        .status(200)
        .json({ message: 'The classes service is working properly!' })
})

router.get('/', authUser, async (req: Request, res: Response) => {
    try {
        const classes = await Class.find()
        return res.status(200).json(classes)
    } catch {
        return res.status(500).json({ error: ERROR_SERVER })
    }
})

router.get('/:id', authUser, async (req: Request, res: Response) => {
    try {
        const idParameter = req.params.id
        if (!mongoose.Types.ObjectId.isValid(idParameter)) {
            return res.status(400).json({ error: 'Invalid ID format' })
        }
        //TODO: Check if user is enrolled in the course
        const classData = await Class.findById(req.params.id)
        if (classData) {
            const publicUrl: string = classData.file
            const signedUrls = await generateSignedUrls(publicUrl)
            classData.file = signedUrls
            return res.status(200).json(classData)
        } else {
            return res.status(404).json({ error: ERROR_CLASS_NOT_FOUND })
        }
    } catch {
        return res.status(500).json({ error: ERROR_SERVER })
    }
})

//TODO: Connect to course microservice in frontend

router.post(
    '/course/:courseId',
    upload.single('file'),
    async (req: Request, res: Response) => {
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
            //TODO: Get course from course microservice and add class to it
            const { title, description, order }: ClassInputs = req.body

            if (!title || !description || !order || !req.file) {
                return res.status(400).json({
                    error: 'Missing required fields (title, description, order, file)',
                })
            }

            // Verify file type
            const contentType = req.file.mimetype

            if (!(await canUpload(username, plan, req.file.size))) {
                return res.status(403).json({
                    error: 'Unauthorized: You have exceeded your storage limit',
                })
            }

            if (!allowedMimeTypes.includes(contentType)) {
                return res.status(400).json({
                    error: 'Invalid file type. Only quicktime ,mp4 and mpeg video files are allowed.',
                })
            }

            const newClass = Class.build({
                title,
                description,
                order,
                file: 'dummy',
            })

            const savedClass = await newClass.save()

            //Save blob to storage
            // const blob = bucket.file(`${uuidv4()}-${req.file.originalname}`)
            const blob = bucket.file(
                `${username}-${uuidv4()}-${req.file.originalname}`
            )
            const blobStream = blob.createWriteStream({
                metadata: {
                    contentType: req.file.mimetype,
                },
            })

            //Error case
            blobStream.on('error', async (err) => {
                await Class.deleteOne({ _id: savedClass._id })
                return res.status(500).send()
            })

            //Case success
            blobStream.on('finish', async () => {
                const publicUrl = `https://storage.googleapis.com/${bucketName}/${blob.name}`
                savedClass.file = publicUrl
                const updatedClass = await savedClass.save()
                const data = {
                    courseId: req.params.courseId,
                    classId: updatedClass._id,
                }
                await sendMessage(
                    'courses-microservice',
                    'notificationNewClass',
                    process.env.API_KEY ?? '',
                    JSON.stringify(data)
                )
                res.status(201).json(updatedClass)
            })

            blobStream.end(req.file.buffer)
        } catch (error) {
            res.status(500).json({ error: ERROR_SERVER })
        }
    }
)

router.put(
    '/:id',
    upload.single('file'),
    async (req: Request, res: Response) => {
        //TODO: Check if user is the author of the class
        try {
            // const username: string = authUser.username
            // const plan: string = authUser.plan
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
            const _class = await Class.findById(req.params.id)

            if (!_class) {
                return res.status(404).json({ error: ERROR_CLASS_NOT_FOUND })
            }

            const { title, description, order }: ClassInputs = req.body

            if (!title && !description && !order && !req.file) {
                return res.status(400).json({
                    error: 'No fields to update provided',
                })
            }

            // Option 1: Update file (and fields)
            if (req.file) {
                if (!(await canUpload(username, plan, req.file.size))) {
                    return res.status(403).json({
                        error: 'Unauthorized: You have exceeded your storage limit',
                    })
                }
                if (title) _class.title = title
                if (description) _class.description = description
                if (order) _class.order = order

                // Verify file type

                const contentType = req.file.mimetype

                if (!allowedMimeTypes.includes(contentType)) {
                    return res.status(400).json({
                        error: 'Invalid file type. Only quicktime,mp4 and mpeg video files are allowed.',
                    })
                }
                let updatedClass: ClassDoc
                try {
                    updatedClass = await _class.save()
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
                    return res
                        .status(500)
                        .json({ error: 'Error uploading file.' })
                })

                blobStream.on('finish', async () => {
                    if (_class.file) {
                        const oldFileName = getFileNameFromUrl(_class.file)
                        if (oldFileName) {
                            await bucket.file(oldFileName).delete()
                        }
                    }
                    const publicUrl = `https://storage.googleapis.com/${bucketName}/${blob.name}`
                    updatedClass.file = publicUrl
                    const updatedClassWithFile = await updatedClass.save()
                    res.status(200).json(updatedClassWithFile)
                })

                blobStream.end(req.file.buffer)
                // Option 2: Update fields
            } else {
                if (title) _class.title = title
                if (description) _class.description = description
                if (order) _class.order = order

                const savedClass = await _class.save()
                return res.status(200).json(savedClass)
            }
        } catch {
            return res.status(500).json({ error: ERROR_SERVER })
        }
    }
)

router.delete('/:id', authUser, async (req: Request, res: Response) => {
    //TODO: Check if user is the author of the class
    try {
        const idParameter = req.params.id
        if (!mongoose.Types.ObjectId.isValid(idParameter)) {
            return res.status(400).json({ error: 'Invalid ID format' })
        }

        const classData = await Class.findById(req.params.id)
        if (classData) {
            const fileUrl = classData.file
            const fileName = fileUrl.split('/').pop()

            try {
                //Delete file from bucket
                if (fileName !== undefined) {
                    await bucket.file(fileName).delete()
                }
            } catch (error) {
                return res
                    .status(500)
                    .json({ error: 'Error deleting file from bucket' })
            }

            await classData.deleteOne()
            const data = {
                classId: req.params.id,
            }
            await sendMessage(
                'courses-microservice',
                'notificationDeleteClass',
                process.env.API_KEY ?? '',
                JSON.stringify(data)
            )
            return res.status(204).send()
        }
        return res.status(404).json({ error: ERROR_CLASS_NOT_FOUND })
    } catch (error) {
        return res.status(500).send()
    }
})

export default router

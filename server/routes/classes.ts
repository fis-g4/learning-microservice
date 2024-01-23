import express, { Request, Response } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { Storage } from '@google-cloud/storage'

import { Class, ClassDoc } from '../db/models/class'
import { authUser } from '../utils/auth/auth'
import { sendMessage } from '../utils/rabbitmq/operations'
import {
    IUser,
    getPayloadFromToken,
    getTokenFromRequest,
} from '../utils/jwtUtils'
import {
    canUpload,
    generateSignedUrl,
    getFileNameFromUrl,
} from '../utils/googleCloud/storage'
import { getCourseById } from '../utils/mocks/courses'
import { handleError, isValidObjectId } from '../utils/routes/auxFunctions'

const router = express.Router()

// Storage configuration

const storage = new Storage({
    keyFilename: '../GoogleCloudKey.json',
})

const bucketName = process.env.CLASSES_BUCKET ?? 'classes-bucket'
const bucket = storage.bucket(bucketName)

const ERROR_CLASS_NOT_FOUND = 'Class not found'

const allowedMimeTypes = ['video/mp4', 'video/mpeg', 'video/quicktime']

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024,
    },
})

// ------------------------ GET ROUTES ------------------------

router.get('/check', async (req: Request, res: Response) => {
    return res
        .status(200)
        .json({ message: 'The classes service is working properly!' })
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
        const classData = await Class.findById(req.params.id)

        if (classData) {
            // Mock course
            const course = await getCourseById(classData.courseId)

            if (!course) {
                return res.status(404).json({ error: 'Course not found' })
            }

            if (
                !(
                    course.instructor === 'Mock Instructor' ||
                    course.purchasers.includes(username) ||
                    course.price === 0
                )
            ) {
                return res.status(403).json({
                    error: 'Unauthorized: You are not the authorized to get this course',
                })
            }
            //
            const publicUrl: string = classData.file
            const signedUrl = await generateSignedUrl(
                publicUrl,
                bucketName,
                storage
            )
            classData.file = signedUrl.readUrl
            return res.status(200).json(classData)
        } else {
            return res.status(404).json({ error: ERROR_CLASS_NOT_FOUND })
        }
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

            let decodedToken: IUser = await getPayloadFromToken(
                getTokenFromRequest(req) ?? ''
            )
            const username: string = decodedToken.username

            if (!course.purchasers.includes(username)) {
                return res.status(403).json({
                    error: 'Unauthorized: You are not the authorized to get this course',
                })
            }
            //

            const classes = await Class.find({ courseId })

            for (const _class of classes) {
                const publicUrl: string = _class.file
                const signedUrl = await generateSignedUrl(
                    publicUrl,
                    bucketName,
                    storage
                )
                _class.file = signedUrl.readUrl
            }

            return res
                .status(200)
                .json(classes.map((_class) => _class.toJSON()))
        } catch (error) {
            return handleError(res, error)
        }
    }
)

// ------------------------ POST ROUTES ------------------------

router.post(
    '/course/:courseId',
    upload.single('file'),
    authUser,
    async (req: Request, res: Response) => {
        try {
            let decodedToken: IUser = await getPayloadFromToken(
                getTokenFromRequest(req) ?? ''
            )
            const username: string = decodedToken.username

            const plan = decodedToken.plan

            //TODO: Get course from course microservice and add class to it
            const { title, description, order }: ClassInputs = req.body

            if (!title || !description || (!order && !req.file)) {
                return res.status(400).json({
                    error: 'Missing required fields (title, description, order, file, creator, courseId)',
                })
            }
            const courseId = req.params.courseId

            // Mock course
            const course = await getCourseById(courseId)

            if (!course) {
                return res.status(404).json({ error: 'Course not found' })
            }

            if (course.instructor !== 'Mock Instructor') {
                return res.status(403).json({
                    error: 'Unauthorized: You are not the instructor of this course',
                })
            }

            // end mock

            const creator = username
            // Verify file type
            const contentType = req.file?.mimetype ?? ''

            const canUploadResult = await canUpload(
                username,
                plan,
                req.file?.size ?? 0,
                bucket,
                'class'
            )

            if (!canUploadResult.success) {
                return res.status(403).json({
                    error: canUploadResult.message,
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
                courseId,
                creator,
            })

            const savedClass = await newClass.save()

            //Save blob to storage
            const blob = bucket.file(
                `${username}-${uuidv4()}-${req.file?.originalname}`
            )
            const blobStream = blob.createWriteStream({
                metadata: {
                    contentType: req.file?.mimetype,
                },
            })

            //Error case
            blobStream.on('error', async (err) => {
                await Class.deleteOne({ _id: savedClass._id })
                return res.status(500).send()
            })

            //Case success
            blobStream.on('finish', async () => {
                const publicUrl: string = `${blob.name}`
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
                res.status(201).json({ message: 'Class created successfully' })
            })

            blobStream.end(req.file?.buffer)
        } catch (error) {
            handleError(res, error)
        }
    }
)

// ------------------------ PUT ROUTES ------------------------

router.put(
    '/:id',
    upload.single('file'),
    authUser,
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

            const _class = await Class.findById(req.params.id)

            if (!_class) {
                return res.status(404).json({ error: ERROR_CLASS_NOT_FOUND })
            }
            if (username != _class.creator) {
                return res.status(403).json({
                    error: 'Unauthorized: You are not the creator of this class',
                })
            }

            const {
                title,
                description,
                order,
                creator,
                courseId,
            }: ClassInputs = req.body

            if (
                !title &&
                !description &&
                !order &&
                !creator &&
                !courseId &&
                !req.file
            ) {
                return res.status(400).json({
                    error: 'No fields to update provided',
                })
            }

            // Option 1: Update file (and fields)
            if (req.file) {
                const canUploadResult = await canUpload(
                    username,
                    plan,
                    req.file.size,
                    bucket,
                    'class'
                )

                if (!canUploadResult.success) {
                    return res.status(403).json({
                        error: canUploadResult.message,
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
                    const publicUrl: string = `${blob.name}`
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

                let updatedClass: ClassDoc
                try {
                    updatedClass = await _class.save()
                } catch (err: any) {
                    return res
                        .status(400)
                        .json({ error: err.message ?? 'Invalid data' })
                }
                return res.status(200).json(updatedClass)
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

        const classData = await Class.findById(req.params.id)
        if (classData) {
            const fileUrl = classData.file
            const fileName = fileUrl.split('/').pop()
            if (classData.creator === username) {
                //Delete file from bucket
                if (fileName !== undefined) {
                    await bucket.file(fileName).delete()
                }

                await Class.deleteOne({ _id: classData.id })
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
            } else {
                return res.status(403).json({
                    error: 'Unauthorized: You are not the author of this class',
                })
            }
        } else {
            return res.status(404).json({ error: ERROR_CLASS_NOT_FOUND })
        }
    } catch (error) {
        handleError(res, error)
    }
})

export default router

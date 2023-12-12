import express, { Request, Response } from 'express'
import { Class } from '../db/models/class'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { Storage } from '@google-cloud/storage'

const router = express.Router()
const storage = new Storage({
    keyFilename: './GoogleCloudKey.json',
})

const bucketName = 'classes-bucket'
const bucket = storage.bucket(bucketName)

const allowedMimeTypes = ['video/mp4', 'video/mpeg', 'video/quicktime']

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 1024 * 1024 * 1024, // 1 GB
    },
})

function getFileNameFromUrl(url: string): string | null {
    const match = url.match(/\/([^\/?#]+)[^\/]*$/)
    return match ? match[1] : null
}

router.get('/:id', async (req: Request, res: Response) => {
    //TODO: Check if user has access to class

    const classData = await Class.findById(req.params.id)
    if (classData) {
        return res.status(200).json(classData)
    }
    return res.status(404).json({ error: 'Class not found' })
})

//Reminder

/*

this route lets user just create a new class, but it doesn't let him add it to a course

this is responsible of another microservice

*/

//TODO: Connect to course microservice in frontend

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
    try {
        const { title, description, order }: ClassInputs = req.body

        if (!title || !description || !order || !req.file) {
            return res.status(400).json({
                error: 'Missing required fields (title, description, order, file)',
            })
        }

        // Verify file type
        const contentType = req.file.mimetype

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

        try {
            const savedClass = await newClass.save()

            //Save blob to storage
            const blob = bucket.file(`${uuidv4()}-${req.file.originalname}`)
            const blobStream = blob.createWriteStream({
                metadata: {
                    contentType: req.file.mimetype,
                },
            })

            //Error case
            blobStream.on('error', async (err) => {
                await Class.deleteOne({ _id: savedClass._id })
                res.status(500).json({ error: 'Error uploading file.' })
            })

            //Case success
            blobStream.on('finish', async () => {
                const publicUrl = `https://storage.googleapis.com/${bucketName}/${blob.name}`
                savedClass.file = publicUrl
                const updatedClass = await savedClass.save()
                res.status(201).json(updatedClass)
            })

            blobStream.end(req.file.buffer)
        } catch (error) {
            res.status(500).json({ error: 'Error saving class.' })
        }
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' })
    }
})

router.put(
    '/:id',
    upload.single('file'),
    async (req: Request, res: Response) => {
        //TODO: Check if user is the author of the class

        const _class = await Class.findById(req.params.id)

        if (!_class) {
            return res.status(404).json({ error: 'Class not found' })
        }

        const { title, description, order }: ClassInputs = req.body

        if (!title && !description && !order && !req.file) {
            return res.status(400).json({
                error: 'No fields to update provided',
            })
        }

        // Option 1: Update file (and fields)
        if (req.file) {
            try {
                if (title) _class.title = title
                if (description) _class.description = description
                if (order) _class.order = order

                // Verify file type

                const contentType = req.file.mimetype

                if (!allowedMimeTypes.includes(contentType)) {
                    return res.status(400).json({
                        error: 'Invalid file type. Only quicktime ,mp4 and mpeg video files are allowed.',
                    })
                }
                const savedClass = await _class.save()

                const newFileName = `${uuidv4()}-${req.file.originalname}`
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
                    savedClass.file = publicUrl
                    const updatedClassWithFile = await savedClass.save()
                    res.status(200).json(updatedClassWithFile)
                })

                blobStream.end(req.file.buffer)
            } catch (error) {
                res.status(500).json({ error: 'Error saving class.' })
            }
            // Option 2: Update fields
        } else {
            if (title) _class.title = title
            if (description) _class.description = description
            if (order) _class.order = order

            const savedClass = await _class.save()
            return res.status(200).json(savedClass)
        }
    }
)

router.delete('/:id', async (req: Request, res: Response) => {
    //TODO: Check if user is the author of the class

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
        return res.status(200).json({ message: 'Class deleted successfully' })
    }
    return res.status(404).json({ error: 'Class not found' })
})

export default router

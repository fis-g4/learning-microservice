import request from 'supertest'
import jwt from 'jsonwebtoken'

import { IPayload } from '../utils/jwtUtils'
import { Class } from '../db/models/class'

import dotenv from 'dotenv'
dotenv.config()

const app = require('../app')

const URL_BASE = '/api/v1/classes'
const JSON_WEB_TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXlsb2FkIjp7Il9pZCI6IjY1NzFiNzNjMjUyYWRlZWI4MDczODNjNiIsImZpcnN0TmFtZSI6Ik5vbWJyZSIsImxhc3ROYW1lIjoiQXBlbGxpZG8iLCJ1c2VybmFtZSI6Im1hcmlhIiwicGFzc3dvcmQiOiJjb250cmFzZW5hMTIzIiwiZW1haWwiOiJ1c3VhcmlvQGV4YW1wbGUuY29tIiwicGxhbiI6IlBSRU1JVU0iLCJyb2xlIjoiVVNFUiJ9LCJpYXQiOjE3MDIwNjI5MzksImV4cCI6MTczMzU5ODkzOX0.Hu0f9BoIzULvkZzfCWGvSSxofUTABK6D4PeGuNw_438'
const UNAUTHORIZED_JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXlsb2FkIjp7Il9pZCI6IjY1NzFiNzNjMjUyYWRlZWI4MDczODNjNiIsImZpcnN0TmFtZSI6Ik5vbWJyZSIsImxhc3ROYW1lIjoiQXBlbGxpZG8iLCJ1c2VybmFtZSI6Im1hcnRhIiwicGFzc3dvcmQiOiJjb250cmFzZW5hMTIzIiwiZW1haWwiOiJ1c3VhcmlvQGV4YW1wbGUuY29tIiwicGxhbiI6IlBSRU1JVU0iLCJyb2xlIjoiVVNFUiJ9LCJpYXQiOjE3MDIwNjI5MDAsImV4cCI6MTczMzU5ODkwMH0.Vvw5IZy7u35VBuodZTauln1Nf7PDDaOcNQbHuIE4F5c'
const JWT_SECRET = 'secret'

// Function to verify a token
const verifyToken = (token: string) => {
    return jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
    }) as IPayload
}

// Classes to use in tests
const classes = [

    new Class({
        _id: '615e2f3b1d9f9b2b4c9e9b1a',
        __v: 0,
        title: 'Clase 1',
        description: 'Descripción 1',
        file: 'https://mockedFile1.mp4'
    }),

    new Class({
        _id: '615e2f3b1d9f9b2b4c9e9b1b',
        __v: 0,
        title: 'Clase 2',
        description: 'Descripción 2',
        file: 'https://mockedFile1.mpeg'
    }),

    new Class({
        _id: '615e2f3b1d9f9b2b4c9e9b1c',
        __v: 0,
        title: 'Clase 3',
        description: 'Descripción 3',
        file: 'https://mockedFile1.quicktime'
    }),
]



// Endpoints to test

const ClassEndpoint = `${URL_BASE}/${classes[0]._id}`
const CourseClassesEndpoint = `${URL_BASE}/course/${classes[0]._id}`

// Google cloud storage mock
jest.mock('@google-cloud/storage', () => {
    const createWriteStreamMock = jest.fn()
    createWriteStreamMock.mockReturnValue({
        on: jest.fn((event: string, callback: Function) => {
            if (event === 'error') {
                return
            } else if (event === 'finish') {
                return callback()
            }
        }),
        end: jest.fn(),
    })

    return {
        Storage: jest.fn(() => ({
            bucket: jest.fn(() => ({
                file: jest.fn(() => ({
                    createWriteStream: createWriteStreamMock,
                    delete: jest.fn(),
                })),
            })),
        })),
    }
})

//Multer mock
type MockRequest = {
    file: {
        originalname: string
        mimetype: string
        buffer: Buffer
    }
}

type MockNextFunction = () => void

const mockMulter = {
    memoryStorage: jest.fn(() => ({
        single: jest.fn(
            (fieldName: string) =>
                (req: MockRequest, res: any, next: MockNextFunction) => {
                    req.file = {
                        originalname: 'mockedFile1.mp4',
                        mimetype: 'video/mp4',
                        buffer: Buffer.from('Mocked file content'),
                    }
                    next()
                }
        ),
    })),
}

// Classes API tests
describe('Classes API', () => {
    
    describe('GET /classes/:id', () => {
        let findClassByIdMock: jest.SpyInstance

        beforeAll(() => {
            findClassByIdMock = jest.spyOn(Class, 'findById')
        })

        it('Should return OK when class is found', async () => {
            findClassByIdMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )
            const response = await request(app)
                .get(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(200)
            expect(response.body.title).toBe(classes[0].title)
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app).get(ClassEndpoint)

            expect(response.status).toBe(401)
        })

        it('Should return unauthorized error', async () => {
            findClassByIdMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )
            const response = await request(app)
                .get(ClassEndpoint)
                .set('Authorization', `Bearer ${UNAUTHORIZED_JWT}`)

            expect(response.status).toBe(403)
        })

        it('Should return not found when class is not found', async () => {
            findClassByIdMock.mockImplementation(async () =>
                Promise.resolve()
            )
            const response = await request(app)
                .get(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(404)
        })

        it('Should return internal server error', async () => {
            findClassByIdMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )
            const response = await request(app)
                .get(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(500)
        })
    })

    describe('POST /classes/course/:courseId', () => {
        let createClassMock: jest.SpyInstance
        beforeAll(() => {
            createClassMock = jest.spyOn(Class.prototype, 'save')
            jest.mock('multer', () => mockMulter)
        })

        it('Should return OK when class is created', async () => {
            createClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )
            const response = await request(app)
                .post(URL_BASE)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .field('description', 'Descripción 1')
                .attach(
                    'file',
                    //TODO: Change to real video file
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile1.txt'
                )

            expect(response.status).toBe(201)
            expect(response.body.message).toBe('Class created successfully')
        })

        it('Invalid data', async () => {
            createClassMock.mockImplementation(async () => {
                throw new Error('Invalid data')
            })

            const response = await request(app)
                .post(URL_BASE)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .field('description', 'Descripción 1')
                .attach(
                    'file',
                    // TODO: Change to real video file
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile1.txt'
                )

            expect(response.status).toBe(400)
            expect(response.body.error).toBe('Invalid data')
        })

        it('Missing fields', async () => {
            createClassMock.mockImplementation(async () => {
                throw new Error(
                    'Missing required fields: title, description, file'
                )
            })

            const response = await request(app)
                .post(URL_BASE)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .attach(
                    'file',
                    // TODO: Change to real video file
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile1.txt'
                )

            expect(response.status).toBe(400)
            expect(response.body.error).toBe(
                'Missing required fields: title, description, file'
            )
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app)
                .post(URL_BASE)
                .field('title', 'Clase 1')
                .field('description', 'Descripción 1')
                .attach(
                    'file',
                    // TODO: Change to real video file
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile1.txt'
                )

            expect(response.status).toBe(401)
        })
    })

    describe('PUT /classes/:id', () => {
        let createClassMock: jest.SpyInstance
        let findByIdClassMock: jest.SpyInstance
        beforeAll(() => {
            createClassMock = jest.spyOn(Class.prototype, 'save')
            findByIdClassMock = jest.spyOn(Class, 'findById')
            jest.mock('multer', () => mockMulter)
        })

        it('Shoud return OK when class is updated', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )

            createClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )

            const response = await request(app)
                .put(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1 actualizada')
                .field('description', 'Descripción 1')
                .attach(
                    'file',
                    // TODO: Change to real video file
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile1.txt'
                )

            expect(response.status).toBe(200)
            expect(response.body.title).toBe('Clase 1 actualizada')
        })

        it('Invalid field', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )

            createClassMock.mockImplementation(async () => {
                throw new Error('Invalid data')
            })

            const response = await request(app)
                .put(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .field('description', 1)
                .attach(
                    'file',
                    // TODO: Change to real video file
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile1.txt'
                )

            expect(response.status).toBe(400)
            expect(response.body.error).toBe('Invalid data')
        })

        it('No fields to update provided', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )

            createClassMock.mockImplementation(async () => {
                throw new Error('No fields to update provided')
            })

            const response = await request(app)
                .put(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(400)
            expect(response.body.error).toBe('No fields to update provided')
        })

        it('Invalid action, same fields without file provided', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )

            createClassMock.mockImplementation(async () => {
                throw new Error('Invalid data')
            })

            const response = await request(app)
                .put(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .field('description', 1)

            expect(response.status).toBe(400)
            expect(response.body.error).toBe('Invalid data')
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app)
                .put(ClassEndpoint)
                .field('title', 'Clase 1')
                .field('description', 'Descripción 1')
                .attach(
                    'file',
                    // TODO: Change to real video file
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile1.txt'
                )

            expect(response.status).toBe(401)
        })

        it('Should return unauthenticated error', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )

            const response = await request(app)
                .put(ClassEndpoint)
                .set('Authorization', `Bearer ${UNAUTHORIZED_JWT}`)
                .field('title', 'Clase 1')
                .field('description', 'Descripción 1')
                .attach(
                    'file',
                    // Todo: Change to real video file
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile1.txt'
                )

            expect(response.status).toBe(403)
        })

        it('Class not found', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve()
            )

            const response = await request(app)
                .put('/api/v1/classes/615e2f3b1d9f9b2b4c9e9b1a')
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .field('description', 'Descripción 1')
                .attach(
                    'file',
                    // TODO: Change to real video file
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile1.txt'
                )

            expect(response.status).toBe(404)
            expect(response.body.error).toBe('Class not found')
        })

        it('Internal server error', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )

            const response = await request(app)
                .put(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .field('description', 'Descripción 1')
                .attach(
                    'file',
                    // TODO: Change to real video file
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile1.txt'
                )

            expect(response.status).toBe(500)
        })
    })

    describe('DELETE /classes/:id', () => {
        let findByIdClassMock: jest.SpyInstance
        let deleteClassMock: jest.SpyInstance
        beforeAll(() => {
            findByIdClassMock = jest.spyOn(Class, 'findById')
            deleteClassMock = jest.spyOn(Class, 'deleteOne')
        })

        it('Should return OK when class is deleted', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )

            deleteClassMock.mockImplementation(async () => Promise.resolve())

            const response = await request(app)
                .delete(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(204)
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app).delete(ClassEndpoint)

            expect(response.status).toBe(401)
        })

        it('Should return unauthorized error', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )

            deleteClassMock.mockImplementation(async () => Promise.resolve())

            const response = await request(app)
                .delete(ClassEndpoint)
                .set('Authorization', `Bearer ${UNAUTHORIZED_JWT}`)

            expect(response.status).toBe(403)
        })

        it('Class not found', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve()
            )

            const response = await request(app)
                .delete('/api/v1/class/615e2f3b1d9f9b2b4c9e9b1a')
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(404)
            expect(response.body.error).toBe('Class not found')
        })

        it('Internal server error', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )

            deleteClassMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )

            const response = await request(app)
                .delete(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(500)
        })
    })
})

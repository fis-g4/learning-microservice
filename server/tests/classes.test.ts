import request from 'supertest'
import 'dotenv/config'
import { generateToken } from '../utils/jwtUtils'
import { Class } from '../db/models/class'
import redisClient from '../db/redis'


const app = require('../app')

const URL_BASE = '/v1/classes'

enum PlanType {
    FREE = 'FREE',
    PREMIUM = 'PREMIUM',
    PRO = 'PRO',
}

enum UserRole {
    USER = 'USER',
    ADMIN = 'ADMIN',
}

const TEST_USER = {
    firstName: 'Test',
    lastName: 'User',
    username: 'TEST_USER',
    password: 'testpassword',
    email: 'testemail@example.com',
    plan: PlanType.FREE,
    role: UserRole.USER,
}

const TEST_USER_2 = {
    firstName: 'Test 2',
    lastName: 'User 2',
    username: 'TEST_USER_2',
    password: 'testpassword2',
    email: 'testemail2@example.com',
    plan: PlanType.FREE,
    role: UserRole.USER,
}

const TEST_USER_3 = {
    firstName: 'Test 3',
    lastName: 'User 3',
    username: 'TEST_USER_3',
    password: 'testpassword3',
    email: 'testemail3@example.com',
    plan: PlanType.FREE,
    role: UserRole.USER,
}
const JSON_WEB_TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXlsb2FkIjp7Il9pZCI6IjY1NzFiNzNjMjUyYWRlZWI4MDczODNjNiIsImZpcnN0TmFtZSI6Ik5vbWJyZSIsImxhc3ROYW1lIjoiQXBlbGxpZG8iLCJ1c2VybmFtZSI6Im1hcmlhIiwicGFzc3dvcmQiOiJjb250cmFzZW5hMTIzIiwiZW1haWwiOiJ1c3VhcmlvQGV4YW1wbGUuY29tIiwicGxhbiI6IlBSRU1JVU0iLCJyb2xlIjoiVVNFUiJ9LCJpYXQiOjE3MDIwNjI5MzksImV4cCI6MTczMzU5ODkzOX0.Hu0f9BoIzULvkZzfCWGvSSxofUTABK6D4PeGuNw_438'



// Classes to use in tests
const classes = [

    new Class({
        _id: '615e2f3b1d9f9b2b4c9e9b1a',
        __v: 0,
        title: 'Clase 1',
        description: 'Descripción 1',
        file: 'https://mockedFile1.mp4',
        creator: 'TEST_USER',
        courseId: '615e2u3b1d9f9b2b4c9e9b1a'
    }),

    new Class({
        _id: '615e2f3b1d9f9b2b4c9e9b1b',
        __v: 0,
        title: 'Clase 2',
        description: 'Descripción 2',
        file: 'https://mockedFile1.mpeg',
        creator: 'TEST_USER_2',
        courseId: '615e2f3b1y9f9b2b4c9e9b1a'
    }),

    new Class({
        _id: '615e2f3b1d9f9b2b4c9e9b1c',
        __v: 0,
        title: 'Clase 3',
        description: 'Descripción 3',
        file: 'https://mockedFile1.quicktime',
        creator: 'TEST_USER_3',
        courseId: '615e2f3b1d9f9b2b4c9e9b¡5pa'
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

// Redis

jest.mock('redis', () => {
    return {
        createClient: jest.fn(() => ({
            connect: jest.fn(),
            disconnect: jest.fn(),
            get: jest.fn(),
            exists: jest.fn(),
            on: jest.fn((event: string, callback: Function) => {
                if (event === 'error') {
                    return
                } else if (event === 'ready') {
                    return callback()
                }
            }),
        })),
    }
})


// Send message function

jest.mock('../rabbitmq/operations', () => {
    return {
        sendMessage: jest.fn(),
    }
})

// Classes API tests
describe('Classes API', () => {
    
    describe('GET /classes/:id', () => {
        let findClassByIdMock: jest.SpyInstance
        let JSON_WEB_TOKEN: string
        let UNAUTHORIZED_JWT: string

        beforeAll(async () => {
            findClassByIdMock = jest.spyOn(Class, 'findById')
            JSON_WEB_TOKEN = (await generateToken(TEST_USER)) as string
            console.log(JSON_WEB_TOKEN)
            UNAUTHORIZED_JWT = (await generateToken(TEST_USER_3)) as string            
        })

        it('Should return OK when class is found and its review is in cache database', async () => {
            jest.spyOn(redisClient, 'exists').mockImplementation(async () =>
            Promise.resolve(0)
        )
            findClassByIdMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )
            const response = await request(app)
                .get(ClassEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(200)
            expect(response.body.title).toBe(classes[0].title)
        })

        it('Should return OK when class is found and its review is not in cache database', async () => {
            jest.spyOn(redisClient, 'exists').mockImplementation(async () =>
            Promise.resolve(1)
            )
            jest.spyOn(redisClient, 'get').mockImplementation(async () =>
                Promise.resolve('5')
            )
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
        let JSON_WEB_TOKEN: string
        beforeAll(async () => {
            createClassMock = jest.spyOn(Class.prototype, 'save')
            jest.mock('multer', () => mockMulter)
            JSON_WEB_TOKEN = (await generateToken(TEST_USER)) as string
        })

        it('Should return OK when class is created', async () => {
            createClassMock.mockImplementation(async () =>
                Promise.resolve(classes[0])
            )
            const response = await request(app)
                .post(CourseClassesEndpoint)   
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .field('order', 1)
                .field('description', 'Descripción 1')
                .field('courseId', '615e2f3b1d9f9b2b4c9e9b1a')
                .field('creator','TEST_USER')
                .attach('file', Buffer.from(''), {
                    contentType: 'video/mp4',
                    filename: 'mockedFile1.mp4',
                  });
            expect(response.status).toBe(201)
            expect(response.body.message).toBe('Class created successfully')
        })

        it('Invalid data', async () => {
            createClassMock.mockImplementation(async () => {
                throw new Error('Invalid data')
            })

            const response = await request(app)
                .post(CourseClassesEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .field('order', 1)
                .field('description', 'Descripción 1')
                .field('courseId', '615e2f3b1d9f9b2b4c9e9b1a')
                .field('creator','TEST_USER')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                );

            expect(response.status).toBe(400)
            expect(response.body.error).toBe("Invalid file type. Only quicktime ,mp4 and mpeg video files are allowed.")
        })

        it('Missing fields', async () => {
            createClassMock.mockImplementation(async () => {
                throw new Error(
                    'Missing required fields (title, description, order, file, creator, courseId)'
                )
            })

            const response = await request(app)
                .post(CourseClassesEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .attach('file', Buffer.from(''), {
                    contentType: 'video/mp4',
                    filename: 'mockedFile1.mp4',
                });

            expect(response.status).toBe(400)
            expect(response.body.error).toBe(
                'Missing required fields (title, description, order, file, creator, courseId)'
            )
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app)
                .post(URL_BASE)
                .field('title', 'Clase 1')
                .field('description', 'Descripción 1')
                .field('courseId', '615e2f3b1d9f9b2b4c9e9b1a')
                .field('creator','TEST_USER')
                .attach('file', Buffer.from(''), {
                    contentType: 'video/mp4',
                    filename: 'mockedFile1.mp4',
                });

            expect(response.status).toBe(401)
        })

        it('Should return internal server error', async () => {
            createClassMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )
            const response = await request(app)
                .post(CourseClassesEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .field('order', 1)
                .field('description', 'Descripción 1')
                .field('courseId', '615e2f3b1d9f9b2b4c9e9b1a')
                .field('creator','TEST_USER')
                .attach('file', Buffer.from(''), {
                    contentType: 'video/mp4',
                    filename: 'mockedFile1.mp4',
                });

            expect(response.status).toBe(500)
        })
    })

    describe('PUT /classes/:id', () => {
        let createClassMock: jest.SpyInstance
        let findByIdClassMock: jest.SpyInstance
        let JSON_WEB_TOKEN: string
        let UNAUTHORIZED_JWT: string
        beforeAll(async () => {
            createClassMock = jest.spyOn(Class.prototype, 'save')
            findByIdClassMock = jest.spyOn(Class, 'findById')
            jest.mock('multer', () => mockMulter)
            JSON_WEB_TOKEN = (await generateToken(TEST_USER)) as string
            UNAUTHORIZED_JWT = (await generateToken(TEST_USER_3)) as string
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
                .field('order', 1)
                .field('description', 'Descripción 1')
                .field('courseId', '615e2f3b1d9f9b2b4c9e9b1a')
                .field('creator','TEST_USER')
                .attach('file', Buffer.from(''), {
                    contentType: 'video/mp4',
                    filename: 'mockedFile1.mp4',
                  });

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
                .field('order', 1)
                .field('description', 1)
                .field('courseId', '615e2f3b1d9f9b2b4c9e9b1a')
                .field('creator','TEST_USER')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(400)
            expect(response.body.error).toBe('Invalid file type. Only quicktime,mp4 and mpeg video files are allowed.')
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
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(400)
            expect(response.body.error).toBe('Invalid file type. Only quicktime,mp4 and mpeg video files are allowed.')
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app)
                .put(ClassEndpoint)
                .field('title', 'Clase 1')
                .field('description', 'Descripción 1')
                .attach('file', Buffer.from(''), {
                    contentType: 'video/mp4',
                    filename: 'mockedFile1.mp4',
                });

            expect(response.status).toBe(401)
        })

        it('Class not found', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve()
            )

            const response = await request(app)
                .put('/v1/classes/615e2f3b1d9f9b2b4c9e9b1a')
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Clase 1')
                .field('description', 'Descripción 1')
                .attach('file', Buffer.from(''), {
                    contentType: 'video/mp4',
                    filename: 'mockedFile1.mp4',
                });

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
                .field('courseId', '615e2f3b1d9f9b2b4c9e9b1a')
                .field('creator','TEST_USER')
                .attach('file', Buffer.from(''), {
                    contentType: 'video/mp4',
                    filename: 'mockedFile1.mp4',
                });

            expect(response.status).toBe(500)
        })
    })

    describe('DELETE /classes/:id', () => {
        let findByIdClassMock: jest.SpyInstance
        let deleteClassMock: jest.SpyInstance
        let JSON_WEB_TOKEN: string
        let UNAUTHORIZED_JWT: string
        beforeAll(async () => {
            findByIdClassMock = jest.spyOn(Class, 'findById')
            deleteClassMock = jest.spyOn(Class, 'deleteOne')
            JSON_WEB_TOKEN = (await generateToken(TEST_USER)) as string
            UNAUTHORIZED_JWT = (await generateToken(TEST_USER_2)) as string
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
            expect(response.body.error).toBe("Unauthorized: You are not the author of this class")
        })

        it('Class not found', async () => {
            findByIdClassMock.mockImplementation(async () =>
                Promise.resolve()
            )

            const response = await request(app)
                .delete('/api/v1/class/615e2f3b1d9f9b2b4c9e9b1a')
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(404)
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

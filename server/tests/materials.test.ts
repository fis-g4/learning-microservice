import request from 'supertest'
import 'dotenv/config'
import { generateToken, getPayloadFromToken, IUser } from '../utils/jwtUtils'

import { Material } from '../db/models/material'
import redisClient from '../db/redis'

const app = require('../app')

const URL_BASE = '/v1/materials'

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

// Materials to use in tests
const materials = [
    new Material({
        _id: '615e2f3b1d9f9b2b4c9e9b1a',
        __v: 0,
        title: 'Libro 1',
        description: 'Descripción 1',
        author: 'TEST_USER',
        price: 12,
        currency: 'EUR',
        purchasers: ['TEST_USER_2'],
        type: 'book',
        file: 'https://storage.googleapis.com/materials-test-bucket/Customer_Agreement_v0.4.pdf',
    }),
    new Material({
        _id: '615e2f3b1d9f9b2b4c9e9b1b',
        __v: 0,
        title: 'Libro 2',
        description: 'Descripción 2',
        author: 'TEST_USER_2',
        price: 15,
        currency: 'EUR',
        purchasers: ['TEST_USER'],
        type: 'book',
        file: 'https://storage.googleapis.com/materials-test-bucket/Customer_Agreement_v0.5.pdf',
    }),
    new Material({
        _id: '615e2f3b1d9f9b2b4c9e9b1c',
        __v: 0,
        title: 'Libro 3',
        description: 'Descripción 3',
        author: 'TEST_USER_3',
        price: 32,
        currency: 'USD',
        purchasers: [],
        type: 'book',
        file: 'https://storage.googleapis.com/materials-test-bucket/Customer_Agreement_v0.6.pdf',
    }),
]

// Endpoints to test

const myMaterialsEndpoint = `${URL_BASE}/me`
const materialUsersEndpoint = `${URL_BASE}/${materials[0]._id}/users`
const specificMaterialEndpoint = `${URL_BASE}/${materials[0]._id}`

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
                        originalname: 'mockedFile.txt',
                        mimetype: 'text/plain',
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

jest.mock('../utils/rabbitmq/operations', () => {
    return {
        sendMessage: jest.fn(),
    }
})

// Materials API tests
describe('Materials API', () => {
    describe('GET /materials/:me', () => {
        let findMaterialsByUsernameMock: jest.SpyInstance
        let signedUrlMock: jest.SpyInstance
        let JSON_WEB_TOKEN: string
        let user: IUser

        beforeAll(async () => {
            JSON_WEB_TOKEN = (await generateToken(TEST_USER)) as string
            user = await getPayloadFromToken(JSON_WEB_TOKEN)

            findMaterialsByUsernameMock = jest.spyOn(Material, 'find')
        })

        it('Should return OK when user is authenticated', async () => {
            findMaterialsByUsernameMock.mockImplementation(async () =>
                Promise.resolve(
                    materials.filter((m) => m.author === user.username)
                )
            )

            const response = await request(app)
                .get(myMaterialsEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(200)
            expect(response.body.length).toBe(1)
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app).get(myMaterialsEndpoint)

            expect(response.status).toBe(401)
        })

        it('Should return internal server error', async () => {
            findMaterialsByUsernameMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )
            const response = await request(app)
                .get(myMaterialsEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(500)
        })
    })

    describe('GET /materials/:id', () => {
        let findMaterialByIdMock: jest.SpyInstance
        let JSON_WEB_TOKEN: string
        let UNAUTHORIZED_JWT: string

        beforeAll(async () => {
            findMaterialByIdMock = jest.spyOn(Material, 'findById')
            JSON_WEB_TOKEN = (await generateToken(TEST_USER)) as string
            UNAUTHORIZED_JWT = (await generateToken(TEST_USER_3)) as string
        })

        it('Should return OK when material is found and its review is in cache database', async () => {
            jest.spyOn(redisClient, 'exists').mockImplementation(async () =>
                Promise.resolve(0)
            )

            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )
            const response = await request(app)
                .get(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(200)
            expect(response.body.title).toBe(materials[0].title)
        })

        it('Should return OK when material is found and its review is not in cache database', async () => {
            jest.spyOn(redisClient, 'exists').mockImplementation(async () =>
                Promise.resolve(1)
            )
            jest.spyOn(redisClient, 'get').mockImplementation(async () =>
                Promise.resolve('5')
            )

            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )
            const response = await request(app)
                .get(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(200)
            expect(response.body.title).toBe(materials[0].title)
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app).get(specificMaterialEndpoint)

            expect(response.status).toBe(401)
        })

        it('Should return unauthorized error', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )
            const response = await request(app)
                .get(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${UNAUTHORIZED_JWT}`)

            expect(response.status).toBe(403)
        })

        it('Should return not found when material is not found', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve()
            )
            const response = await request(app)
                .get(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(404)
        })

        it('Should return internal server error', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )
            const response = await request(app)
                .get(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(500)
        })
    })

    describe('GET /materials/:id/users', () => {
        let findMaterialByIdMock: jest.SpyInstance
        let JSON_WEB_TOKEN: string
        let UNAUTHORIZED_JWT: string

        beforeAll(async () => {
            findMaterialByIdMock = jest.spyOn(Material, 'findById')
            JSON_WEB_TOKEN = (await generateToken(TEST_USER)) as string
            UNAUTHORIZED_JWT = (await generateToken(TEST_USER_3)) as string
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app).get(materialUsersEndpoint)

            expect(response.status).toBe(401)
        })

        it('Should return unauthorized error', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )
            const response = await request(app)
                .get(materialUsersEndpoint)
                .set('Authorization', `Bearer ${UNAUTHORIZED_JWT}`)

            expect(response.status).toBe(403)
        })

        it('Should return not found when material is not found', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve()
            )
            const response = await request(app)
                .get(materialUsersEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(404)
        })

        it('Should return internal server error', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )
            const response = await request(app)
                .get(materialUsersEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(500)
        })
    })

    describe('POST /materials', () => {
        let createMaterialMock: jest.SpyInstance
        let JSON_WEB_TOKEN: string
        beforeAll(async () => {
            createMaterialMock = jest.spyOn(Material.prototype, 'save')
            jest.mock('multer', () => mockMulter)
            JSON_WEB_TOKEN = (await generateToken(TEST_USER)) as string
        })

        it('Should return OK when material is created', async () => {
            createMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )
            const response = await request(app)
                .post(URL_BASE)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Libro 1')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('currency', 'EUR')
                .field('type', 'book')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(201)
            expect(response.body.message).toBe('Material created successfully')
        })

        it('Invalid data', async () => {
            createMaterialMock.mockImplementation(async () => {
                throw new Error('Invalid data')
            })

            const response = await request(app)
                .post(URL_BASE)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Libro 1')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('currency', 'EUR')
                .field('type', 'book')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(400)
            expect(response.body.error).toBe('Invalid data')
        })

        it('Missing fields', async () => {
            createMaterialMock.mockImplementation(async () => {
                throw new Error(
                    'Missing required fields: title, description, price, currency (EUR or USD), file, type (book, article, presentation or exercises)'
                )
            })

            const response = await request(app)
                .post(URL_BASE)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Libro 1')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('type', 'book')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(400)
            expect(response.body.error).toBe(
                'Missing required fields: title, description, price, currency (EUR or USD), file, type (book, article, presentation or exercises)'
            )
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app)
                .post(URL_BASE)
                .field('title', 'Libro 1')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('currency', 'EUR')
                .field('type', 'book')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(401)
        })
    })

    describe('PUT /materials/:id', () => {
        let createMaterialMock: jest.SpyInstance
        let findByIdMaterialMock: jest.SpyInstance
        let JSON_WEB_TOKEN: string
        let UNAUTHORIZED_JWT: string

        beforeAll(async () => {
            createMaterialMock = jest.spyOn(Material.prototype, 'save')
            findByIdMaterialMock = jest.spyOn(Material, 'findById')
            jest.mock('multer', () => mockMulter)
            JSON_WEB_TOKEN = (await generateToken(TEST_USER)) as string
            UNAUTHORIZED_JWT = (await generateToken(TEST_USER_3)) as string
        })

        it('Shoud return OK when material is updated', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            createMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            const response = await request(app)
                .put(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Libro 1 actualizado')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('currency', 'EUR')
                .field('type', 'book')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(200)
            expect(response.body.title).toBe('Libro 1 actualizado')
        })

        it('Invalid field', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            createMaterialMock.mockImplementation(async () => {
                throw new Error('Invalid data')
            })

            const response = await request(app)
                .put(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Libro 1')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('currency', 'INVALID_CURRENCY')
                .field('type', 'book')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(400)
            expect(response.body.error).toBe('Invalid data')
        })

        it('No fields to update provided', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            createMaterialMock.mockImplementation(async () => {
                throw new Error('No fields to update provided')
            })

            const response = await request(app)
                .put(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(400)
            expect(response.body.error).toBe('No fields to update provided')
        })

        it('Invalid action, same fields without file provided', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            createMaterialMock.mockImplementation(async () => {
                throw new Error('Invalid data')
            })

            const response = await request(app)
                .put(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Libro 1')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('currency', 'INVALID_CURRENCY')
                .field('type', 'book')

            expect(response.status).toBe(400)
            expect(response.body.error).toBe('Invalid data')
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app)
                .put(specificMaterialEndpoint)
                .field('title', 'Libro 1')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('currency', 'EUR')
                .field('type', 'book')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(401)
        })

        it('Should return unauthorized error', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            const response = await request(app)
                .put(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${UNAUTHORIZED_JWT}`)
                .field('title', 'Libro 1')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('currency', 'EUR')
                .field('type', 'book')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(403)
        })

        it('Material not found', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve()
            )

            const response = await request(app)
                .put('/v1/materials/615e2f3b1d9f9b2b4c9e9b1a')
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Libro 1')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('currency', 'EUR')
                .field('type', 'book')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(404)
            expect(response.body.error).toBe('Material not found')
        })

        it('Internal server error', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )

            const response = await request(app)
                .put(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)
                .field('title', 'Libro 1')
                .field('description', 'Descripción 1')
                .field('price', 12)
                .field('currency', 'EUR')
                .field('type', 'book')
                .attach(
                    'file',
                    Buffer.from('test file content', 'utf-8'),
                    'mockedFile.txt'
                )

            expect(response.status).toBe(500)
        })
    })

    describe('DELETE /materials/:id', () => {
        let findByIdMaterialMock: jest.SpyInstance
        let deleteMaterialMock: jest.SpyInstance
        let JSON_WEB_TOKEN: string
        let UNAUTHORIZED_JWT: string

        beforeAll(async () => {
            findByIdMaterialMock = jest.spyOn(Material, 'findById')
            deleteMaterialMock = jest.spyOn(Material, 'deleteOne')
            JSON_WEB_TOKEN = (await generateToken(TEST_USER)) as string
            UNAUTHORIZED_JWT = (await generateToken(TEST_USER_2)) as string
        })

        it('Should return OK when material is deleted', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            deleteMaterialMock.mockImplementation(async () => Promise.resolve())

            const response = await request(app)
                .delete(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(204)
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app).delete(specificMaterialEndpoint)

            expect(response.status).toBe(401)
        })

        it('Should return unauthorized error', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            deleteMaterialMock.mockImplementation(async () => Promise.resolve())

            const response = await request(app)
                .delete(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${UNAUTHORIZED_JWT}`)

            expect(response.status).toBe(403)
        })

        it('Material not found', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve()
            )

            const response = await request(app)
                .delete('/v1/materials/615e2f3b1d9f9b2b4c9e9b1a')
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(404)
            expect(response.body.error).toBe('Material not found')
        })

        it('Internal server error', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            deleteMaterialMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )

            const response = await request(app)
                .delete(specificMaterialEndpoint)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(500)
        })
    })
})

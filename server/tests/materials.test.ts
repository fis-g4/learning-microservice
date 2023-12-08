import request from 'supertest'
import dotenv from 'dotenv'
import { IPayload } from '../utils/jwtUtils'
import jwt from 'jsonwebtoken'

import { Material } from '../db/models/material'

dotenv.config()
const app = require('../app')

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

const materials = [
    new Material({
        _id: '615e2f3b1d9f9b2b4c9e9b1a',
        __v: 0,
        title: 'Libro 1',
        description: 'Descripción 1',
        author: 'maria',
        price: 12,
        currency: 'EUR',
        purchasers: ['pepe'],
        type: 'book',
        file: 'https://mockedFile.txt',
    }),
    new Material({
        _id: '615e2f3b1d9f9b2b4c9e9b1b',
        __v: 0,
        title: 'Libro 2',
        description: 'Descripción 2',
        author: 'pepe',
        price: 15,
        currency: 'EUR',
        purchasers: ['maria'],
        type: 'book',
        file: 'https://file2.json',
    }),
    new Material({
        _id: '615e2f3b1d9f9b2b4c9e9b1c',
        __v: 0,
        title: 'Libro 3',
        description: 'Descripción 3',
        author: 'marta',
        price: 32,
        currency: 'USD',
        purchasers: [],
        type: 'book',
        file: 'https://file3.json',
    }),
]

const URL_BASE = '/api/v1/materials'
const JSON_WEB_TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXlsb2FkIjp7Il9pZCI6IjY1NzFiNzNjMjUyYWRlZWI4MDczODNjNiIsImZpcnN0TmFtZSI6Ik5vbWJyZSIsImxhc3ROYW1lIjoiQXBlbGxpZG8iLCJ1c2VybmFtZSI6Im1hcmlhIiwicGFzc3dvcmQiOiJjb250cmFzZW5hMTIzIiwiZW1haWwiOiJ1c3VhcmlvQGV4YW1wbGUuY29tIiwicGxhbiI6IlBSRU1JVU0iLCJyb2xlIjoiVVNFUiJ9LCJpYXQiOjE3MDIwNjI5MzksImV4cCI6MTczMzU5ODkzOX0.Hu0f9BoIzULvkZzfCWGvSSxofUTABK6D4PeGuNw_438'
const UNAUTHORIZED_JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXlsb2FkIjp7Il9pZCI6IjY1NzFiNzNjMjUyYWRlZWI4MDczODNjNiIsImZpcnN0TmFtZSI6Ik5vbWJyZSIsImxhc3ROYW1lIjoiQXBlbGxpZG8iLCJ1c2VybmFtZSI6Im1hcnRhIiwicGFzc3dvcmQiOiJjb250cmFzZW5hMTIzIiwiZW1haWwiOiJ1c3VhcmlvQGV4YW1wbGUuY29tIiwicGxhbiI6IlBSRU1JVU0iLCJyb2xlIjoiVVNFUiJ9LCJpYXQiOjE3MDIwNjI5MDAsImV4cCI6MTczMzU5ODkwMH0.Vvw5IZy7u35VBuodZTauln1Nf7PDDaOcNQbHuIE4F5c'
const JWT_SECRET = 'secret'

describe('Materials API', () => {
    describe('GET /materials/:me', () => {
        let findMaterialsByUsernameMock: jest.SpyInstance
        let payload: IPayload = jwt.verify(JSON_WEB_TOKEN, JWT_SECRET, {
            algorithms: ['HS256'],
        }) as IPayload
        const usernameFromToken = payload.payload.username

        beforeAll(() => {
            findMaterialsByUsernameMock = jest.spyOn(Material, 'find')
        })

        it('Should return OK when user is authenticated', async () => {
            findMaterialsByUsernameMock.mockImplementation(async () =>
                Promise.resolve(
                    materials.filter((m) => m.author === usernameFromToken)
                )
            )
            const response = await request(app)
                .get(`${URL_BASE}/me`)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(200)
            expect(response.body.length).toBe(1)
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app).get(`${URL_BASE}/me`)

            expect(response.status).toBe(401)
        })

        it('Should return internal server error', async () => {
            findMaterialsByUsernameMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )
            const response = await request(app)
                .get(`${URL_BASE}/me`)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(500)
        })
    })

    describe('GET /materials/:id', () => {
        let findMaterialByIdMock: jest.SpyInstance

        beforeAll(() => {
            findMaterialByIdMock = jest.spyOn(Material, 'findById')
        })

        it('Should return OK when material is found', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )
            const response = await request(app)
                .get(`${URL_BASE}/${materials[0]._id}`)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(200)
            expect(response.body.title).toBe(materials[0].title)
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app).get(
                `${URL_BASE}/${materials[0]._id}`
            )

            expect(response.status).toBe(401)
        })

        it('Should return unauthorized error', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )
            const response = await request(app)
                .get(`${URL_BASE}/${materials[0]._id}`)
                .set('Authorization', `Bearer ${UNAUTHORIZED_JWT}`)

            expect(response.status).toBe(403)
        })

        it('Should return not found when material is not found', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve()
            )
            const response = await request(app)
                .get(`${URL_BASE}/${materials[0]._id}`)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(404)
        })

        it('Should return internal server error', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )
            const response = await request(app)
                .get(`${URL_BASE}/${materials[0]._id}`)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(500)
        })
    })

    describe('GET /materials/:id/users', () => {
        let findMaterialByIdMock: jest.SpyInstance

        beforeAll(() => {
            findMaterialByIdMock = jest.spyOn(Material, 'findById')
        })

        it('Should return OK when material is found', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )
            const response = await request(app)
                .get(`${URL_BASE}/${materials[0]._id}/users`)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(200)
            expect(response.body).toHaveProperty('purchasers')
            expect(response.body.purchasers.length).toBe(1)
            expect(response.body.purchasers[0]).toBe(materials[0].purchasers[0])
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app).get(
                `${URL_BASE}/${materials[0]._id}/users`
            )

            expect(response.status).toBe(401)
        })

        it('Should return unauthorized error', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )
            const response = await request(app)
                .get(`${URL_BASE}/${materials[0]._id}/users`)
                .set('Authorization', `Bearer ${UNAUTHORIZED_JWT}`)

            expect(response.status).toBe(403)
        })

        it('Should return not found when material is not found', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.resolve()
            )
            const response = await request(app)
                .get(`${URL_BASE}/${materials[0]._id}/users`)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(404)
        })

        it('Should return internal server error', async () => {
            findMaterialByIdMock.mockImplementation(async () =>
                Promise.reject('Internal server error')
            )
            const response = await request(app)
                .get(`${URL_BASE}/${materials[0]._id}/users`)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(500)
        })
    })

    describe('POST /materials', () => {
        let createMaterialMock: jest.SpyInstance
        beforeAll(() => {
            createMaterialMock = jest.spyOn(Material.prototype, 'save')

            const mockMulter = {
                memoryStorage: jest.fn(() => ({
                    single: jest.fn(
                        (fieldName: string) =>
                            (req: any, res: any, next: any) => {
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

            jest.mock('multer', () => mockMulter)
        })

        it('Should return OK when material is created', async () => {
            createMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )
            const response = await request(app)
                .post('/api/v1/materials')
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
                .post('/api/v1/materials')
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
                .post('/api/v1/materials')
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
                .post('/api/v1/materials')
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
        beforeAll(() => {
            createMaterialMock = jest.spyOn(Material.prototype, 'save')
            findByIdMaterialMock = jest.spyOn(Material, 'findById')

            const mockMulter = {
                memoryStorage: jest.fn(() => ({
                    single: jest.fn(
                        (fieldName: string) =>
                            (req: any, res: any, next: any) => {
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

            jest.mock('multer', () => mockMulter)
        })

        it('Shoud return OK when material is updated', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            createMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            const response = await request(app)
                .put(`/api/v1/materials/${materials[0]._id}`)
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
                .put(`/api/v1/materials/${materials[0]._id}`)
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
                .put(`/api/v1/materials/${materials[0]._id}`)
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
                .put(`/api/v1/materials/${materials[0]._id}`)
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
                .put(`/api/v1/materials/${materials[0]._id}`)
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

        it('Should return unauthenticated error', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            const response = await request(app)
                .put(`/api/v1/materials/${materials[0]._id}`)
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
                .put('/api/v1/materials/615e2f3b1d9f9b2b4c9e9b1a')
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
                .put(`/api/v1/materials/${materials[0]._id}`)
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
        beforeAll(() => {
            findByIdMaterialMock = jest.spyOn(Material, 'findById')
            deleteMaterialMock = jest.spyOn(Material, 'deleteOne')
        })

        it('Should return OK when material is deleted', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            deleteMaterialMock.mockImplementation(async () => Promise.resolve())

            const response = await request(app)
                .delete(`/api/v1/materials/${materials[0]._id}`)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(204)
        })

        it('Should return unauthenticated error', async () => {
            const response = await request(app).delete(
                `/api/v1/materials/${materials[0]._id}`
            )

            expect(response.status).toBe(401)
        })

        it('Should return unauthorized error', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve(materials[0])
            )

            deleteMaterialMock.mockImplementation(async () => Promise.resolve())

            const response = await request(app)
                .delete(`/api/v1/materials/${materials[0]._id}`)
                .set('Authorization', `Bearer ${UNAUTHORIZED_JWT}`)

            expect(response.status).toBe(403)
        })

        it('Material not found', async () => {
            findByIdMaterialMock.mockImplementation(async () =>
                Promise.resolve()
            )

            const response = await request(app)
                .delete('/api/v1/materials/615e2f3b1d9f9b2b4c9e9b1a')
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
                .delete(`/api/v1/materials/${materials[0]._id}`)
                .set('Authorization', `Bearer ${JSON_WEB_TOKEN}`)

            expect(response.status).toBe(500)
        })
    })
})
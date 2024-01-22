import request from 'supertest'
import 'dotenv/config'
import { jwtErrors } from '../utils/errorMessages/jwt'
import { generateToken, getPayloadFromToken, IUser } from '../utils/jwtUtils'
import { Material } from '../db/models/material'
const path = require('path')

const app = require('../app')
const URL_BASE = '/v1/materials'

const TEST_URLS = {
    materialsMe: '/me',
    materialsId: '/:id',
    materialsPurchasers: '/:id/users',
    //updateMaterial: '/:id',
    //associateMaterial: '/:id/course/:courseId/associate',
    //disassociateMaterial: '/:id/course/:courseId/disassociate',
    //deleteMaterial: '/:id',
}

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

const materials = [
    new Material({
        title: 'Libro 1',
        description: 'Descripción 1',
        price: 12,
        currency: 'EUR',
        purchasers: ['TEST_USER_2'],
        type: 'book',
    }),
    new Material({
        title: 'Libro 2',
        description: 'Descripción 2',
        price: 15,
        currency: 'EUR',
        purchasers: ['TEST_USER_2'],
        type: 'book',
    }),
    new Material({
        title: 'Libro 3',
        description: 'Descripción 3',
        price: 32,
        currency: 'USD',
        purchasers: [],
        type: 'book',
    }),
]

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

describe(`GET allMaterials`, () => {
    let token: string
    let user: IUser

    beforeAll(async () => {
        token = (await generateToken(TEST_USER)) as string
        user = (await getPayloadFromToken(token)) as IUser
        const filePath = path.resolve(__dirname, '..', 'test.txt')

        const response = await request(app)
            .post(`${URL_BASE}`)
            .set('Authorization', `Bearer ${token}`)
            .field('title', materials[0].title)
            .field('description', materials[0].description)
            .field('price', materials[0].price)
            .field('currency', materials[0].currency)
            .field('type', materials[0].type)
            .attach('file', filePath)
        expect(response.status).toBe(201)
    }, 1000000)

    it('should return all materials', async () => {
        const response = await request(app)
            .get(`${URL_BASE}`)
            .set('Authorization', `Bearer ${token}`)

        expect(response.status).toBe(200)
        expect(response.body).toHaveLength(3)
    })
})

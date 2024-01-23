import { Storage } from '@google-cloud/storage'

jest.setTimeout(30000)

const learningTestBucketName = 'learning-files-test-bucket'

const storage = new Storage({
    keyFilename: '../GoogleCloudKey.json',
})

const learningTestBucket = storage.bucket(learningTestBucketName)

describe('GCS Connection', () => {
    beforeAll(async () => {
        const [learningTestBucketExists] = await learningTestBucket.exists()
        if (!learningTestBucketExists) {
            throw new Error('Test buckets do not exist')
        }
    })

    beforeEach(async () => {
        await learningTestBucket.deleteFiles()
    })

    afterAll(async () => {
        await learningTestBucket.deleteFiles()
    })

    it('Should upload a file to GCS', async () => {
        const blob = learningTestBucket.file(`fileTest`)

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        })

        blobStream.write('test')
        blobStream.end()

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve)
            blobStream.on('error', reject)
        })

        const [exists] = await blob.exists()
        expect(exists).toBe(true)
    })

    it('Should download a file from GCS', async () => {
        const blob = learningTestBucket.file(`fileTest`)

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        })

        blobStream.write('test')
        blobStream.end()

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve)
            blobStream.on('error', reject)
        })

        const [exists] = await blob.exists()
        expect(exists).toBe(true)

        const [downloadedFile] = await blob.download()
        expect(downloadedFile.toString()).toBe('test')
    })

    it('Should delete a file from GCS', async () => {
        const blob = learningTestBucket.file(`fileTest`)

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        })

        blobStream.write('test')
        blobStream.end()

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve)
            blobStream.on('error', reject)
        })

        const [exists] = await blob.exists()
        expect(exists).toBe(true)

        await blob.delete()

        const [existsAfterDelete] = await blob.exists()
        expect(existsAfterDelete).toBe(false)
    })

    it('Should upload a file to GCS with a folder', async () => {
        const blob = learningTestBucket.file(`folder/fileTest`)

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        })

        blobStream.write('test')
        blobStream.end()

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve)
            blobStream.on('error', reject)
        })

        const [exists] = await blob.exists()
        expect(exists).toBe(true)
    })

    it('Should download a file from GCS with a folder', async () => {
        const blob = learningTestBucket.file(`folder/fileTest`)

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        })

        blobStream.write('test')
        blobStream.end()

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve)
            blobStream.on('error', reject)
        })

        const [exists] = await blob.exists()
        expect(exists).toBe(true)

        const [downloadedFile] = await blob.download()
        expect(downloadedFile.toString()).toBe('test')
    })

    it('Should delete a file from GCS with a folder', async () => {
        const blob = learningTestBucket.file(`folder/fileTest`)

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        })

        blobStream.write('test')
        blobStream.end()

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve)
            blobStream.on('error', reject)
        })

        const [exists] = await blob.exists()
        expect(exists).toBe(true)

        await blob.delete()

        const [existsAfterDelete] = await blob.exists()
        expect(existsAfterDelete).toBe(false)
    })

    it('Should upload a file to GCS with a folder and a subfolder', async () => {
        const blob = learningTestBucket.file(`folder/subfolder/fileTest`)

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        })

        blobStream.write('test')
        blobStream.end()

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve)
            blobStream.on('error', reject)
        })

        const [exists] = await blob.exists()
        expect(exists).toBe(true)
    })

    it('Should download a file from GCS with a folder and a subfolder', async () => {
        const blob = learningTestBucket.file(`folder/subfolder/fileTest`)

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        })

        blobStream.write('test')
        blobStream.end()

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve)
            blobStream.on('error', reject)
        })

        const [exists] = await blob.exists()
        expect(exists).toBe(true)

        const [downloadedFile] = await blob.download()
        expect(downloadedFile.toString()).toBe('test')
    })

    it('Should delete a file from GCS with a folder and a subfolder', async () => {
        const blob = learningTestBucket.file(`folder/subfolder/fileTest`)

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        })

        blobStream.write('test')
        blobStream.end()

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve)
            blobStream.on('error', reject)
        })

        const [exists] = await blob.exists()
        expect(exists).toBe(true)

        await blob.delete()

        const [existsAfterDelete] = await blob.exists()
        expect(existsAfterDelete).toBe(false)
    })

    it('Should upload a file to GCS with a folder and a subfolder and a subfolder', async () => {
        const blob = learningTestBucket.file(
            `folder/subfolder/subfolder/fileTest`
        )

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        })

        blobStream.write('test')
        blobStream.end()

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve)
            blobStream.on('error', reject)
        })

        const [exists] = await blob.exists()
        expect(exists).toBe(true)
    })
})

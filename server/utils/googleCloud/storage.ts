import { Bucket } from '@google-cloud/storage'
import { Storage } from '@google-cloud/storage'

interface UploadResult {
    success: boolean
    message?: string
}

function getFileNameFromUrl(url: string): string | null {
    const match = url.match(/\/([^\/?#]+)[^\/]*$/)
    return match ? match[1] : null
}

async function getUsedSpace(username: string, bucket: Bucket): Promise<number> {
    try {
        const files = await bucket.getFiles()

        let usedSpace: number = 0

        files[0].forEach((file: any) => {
            const regex = new RegExp(`^${username}-`)
            if (file.name.match(regex)) {
                usedSpace += parseInt(file.metadata.size.toString())
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
    newFileSize: number,
    bucket: Bucket,
    typeFile: string
): Promise<UploadResult> {
    const usedSpace = await getUsedSpace(username, bucket)
    const userUsedSpace: number = usedSpace + newFileSize
    const userUploadLimit =
        typeFile === 'material'
            ? getMaterialPlanUploadLimit(plan)
            : getClassPlanUploadLimit(plan)

    if (userUsedSpace > userUploadLimit[1]) {
        return {
            success: false,
            message:
                'You have exceeded your storage limit (' +
                userUploadLimit[1] / 1024 / 1024 / 1024 +
                ' GB)',
        }
    }

    if (newFileSize > userUploadLimit[0]) {
        return {
            success: false,
            message:
                'Your file exceeds the maximum file size (' +
                userUploadLimit[0] / 1024 / 1024 +
                ' MB)',
        }
    }

    return {
        success: true,
    }
}

function getMaterialPlanUploadLimit(plan: string): number[] {
    switch (plan) {
        case 'ADVANCED':
            return [20 * 1024 * 1024, 12 * 1024 * 1024 * 1024]
        case 'PRO':
            return [10 * 1024 * 1024, 25 * 1024 * 1024 * 1024]
        default:
            return [5 * 1024 * 1024, 100 * 1024 * 1024]
    }
}

function getClassPlanUploadLimit(plan: string): number[] {
    switch (plan) {
        case 'ADVANCED':
            return [2 * 1024 * 1024 * 1024, 38 * 1024 * 1024 * 1024]
        case 'PRO':
            return [5 * 1024 * 1024 * 1024, 75 * 1024 * 1024 * 1024]
        default:
            return [350 * 1024 * 1024, 900 * 1024 * 1024]
    }
}

async function generateSignedUrl(
    publicUrl: string,
    bucketName: string,
    storage: Storage
): Promise<any> {
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

export { getFileNameFromUrl, generateSignedUrl, canUpload }

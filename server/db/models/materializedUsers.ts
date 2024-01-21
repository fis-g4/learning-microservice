import mongoose from 'mongoose'

const { Schema } = mongoose

enum PlanType {
    BASIC = 'BASIC',
    ADVANCED = 'ADVANCED',
    PRO = 'PRO',
}

interface IMaterializedUser {
    firstName: string
    lastName: string
    username: string
    email: string
    profilePicture: string
    plan: PlanType
}

interface MaterializedUserDoc extends mongoose.Document {
    firstName: string
    lastName: string
    username: string
    email: string
    profilePicture: string
    plan: PlanType
    insertDate: Date
}

interface UserModelInterface extends mongoose.Model<MaterializedUserDoc> {
    build(attr: IMaterializedUser): MaterializedUserDoc
}

const materializedUserSchema = new Schema({
    firstName: {
        type: String,
        trim: true,
    },
    lastName: {
        type: String,
        trim: true,
    },
    username: {
        type: String,
        unique: true,
        trim: true,
        required: true,
    },
    email: {
        type: String,
        unique: true,
        trim: true,
        required: true,
    },
    profilePicture: {
        type: String,
        trim: true,
    },
    plan: {
        type: String,
        enum: Object.values(PlanType),
        default: PlanType.BASIC,
        trim: true,
    },
    insertDate: {
        type: Date,
        default: Date.now,
    },
})

materializedUserSchema.statics.build = (
    materialezedUser: IMaterializedUser
) => {
    return new MaterializedUser(materialezedUser)
}

const MaterializedUser = mongoose.model<
    MaterializedUserDoc,
    UserModelInterface
>('MaterializedUser', materializedUserSchema)

export { MaterializedUser }

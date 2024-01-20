interface FormInputs {
    email: string
    password: string
    username: string
}

interface MaterialInputs {
    title: string
    description: string
    price: number
    currency: 'USD' | 'EUR'
    purchasers: mongoose.Types.ObjectId[]
    file: string
    type: 'book' | 'article' | 'presentation' | 'exercises'
}

interface ClassInputs {
    title: string
    description: string
    order: number
    file: string
    courseId: string
    creator: string
}

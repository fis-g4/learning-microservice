import populateDB from './populateInitial'
import mongoose from 'mongoose'

mongoose
    .connect(`${process.env.DB_URI ?? ''}`, {
        dbName: `${process.env.DB_NAME ?? ''}`,
        user: `${process.env.DB_USER ?? ''}`,
        pass: `${process.env.DB_PASS ?? ''}`,
    })
    .then(() => {
        console.info('Connected to MongoDB')
        populateDB()
    })
    .catch((err) => {
        console.error(err)
    })

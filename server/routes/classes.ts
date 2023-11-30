import express, { Request, Response } from 'express'
import { Class } from '../db/models/class'
import mongoose from 'mongoose'

const router = express.Router()

router.get("/:id", async (req: Request, res: Response) => {
    //TODO: Check if user has access to class
    
    const classData = await Class.findById(req.params.id)
    if (classData) {
        return res.status(200).json(classData)
    }
    return res.status(404).json({ error: "Class not found" })
})


//Reminder

/*

this route lets user just create a new class, but it doesn't let him add it to a course

this is responsible of another microservice

*/

//TODO: Connect to course microservice in frontend

router.post("/", async (req: Request, res: Response) => {
    const { title, description, order, file }: ClassInputs = req.body

    if (!title || !description || !order || !file) {
        return res.status(400).json({
            error: "Missing required fields (title, description, order, file)",
        })
    }

    const newClass = Class.build({
        title,
        description,
        order,
        file,
    })

    const savedClass = await newClass.save()

    return res.status(200).json(savedClass)
})

router.put("/:id", async (req: Request, res: Response) => {
    //TODO: Check if user is the author of the class
    
    
    const _class = await Class.findById(req.params.id)

    if (!_class) {
        return res.status(404).json({ error: 'Class not found' })
    }

    const { 
        title,
        description, 
        order,
        file,
    }: ClassInputs = req.body

    if (!title && !description && !order && !file) {
        return res.status(400).json({
            error: 'No fields to update provided'
        })
    }

    
    if(title) _class.title = title
    if(description) _class.description = description
    if(order) _class.order = order
    if(file) _class.file = file

    const savedClass = await _class.save()
    return res.status(200).json(savedClass)
    
})

router.delete("/:id", async (req: Request, res: Response) => {
    //TODO: Check if user is the author of the class

    const classData = await Class.findById(req.params.id)
    if (classData) {
        await classData.deleteOne()
        return res.status(200).json({ message: "Class deleted successfully" })
    }
    return res.status(404).json({ error: "Class not found" })
})

export default router
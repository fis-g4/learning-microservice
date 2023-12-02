import express, { Request, Response } from 'express'
import { Material } from '../db/models/material'
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Storage } from '@google-cloud/storage';
import mongoose from 'mongoose'

const router = express.Router()
const storage = new Storage({
    keyFilename: './GoogleCloudKey.json',
  });

const bucketName = 'materials-bucket';
const bucket = storage.bucket(bucketName);

const upload = multer({
storage: multer.memoryStorage(),
limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
},
});

function getFileNameFromUrl(url: string): string | null {
  const match = url.match(/\/([^\/?#]+)[^\/]*$/);
  return match ? match[1] : null;
}

router.get('/me', async (req: Request, res: Response) => {
    //Default Author/userId
    //TODO: Change to logged user
    const userId = new mongoose.Types.ObjectId('60d5ecb44b930ac130e82d7e')

    await Material.find({ author: userId }).then((materials) => {
        res.status(200).json(materials)
    })
})

router.get('/:id', async (req: Request, res: Response) => {
    //TODO: Check if user has access to material
    const material = await Material.findById(req.params.id)
    if (material) {
        return res.status(200).json(material)
    }
    return res.status(404).json({ error: 'Material not found' })
})

router.get('/:id/users', async (req: Request, res: Response) => {
    //TODO: Check if user that is requesting is the author of the material
    const material = await Material.findById(req.params.id)
    if (material) {
        //TODO: Return the users information
        return res.status(200).json({ purchasers: material.purchasers })
    }
    return res.status(404).json({ error: 'Material not found' })
})

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { title, description, price, type }: MaterialInputs = req.body;

    if (!title || !description || !price || !req.file || !type) {
      return res.status(400).json({
        error: 'Missing required fields (title, description, price, file, type)',
      });
    }

      // TODO: Change to logged user
      const author = new mongoose.Types.ObjectId('60d5ecb44b930ac130e82d7e');

      const newMaterial = Material.build({
        title,
        description,
        price,
        author,
        purchasers: [],
        file: 'dummy',
        type,
      });

      try {
          const savedMaterial = await newMaterial.save();

          const blob = bucket.file(`${uuidv4()}-${req.file.originalname}`);
          const blobStream = blob.createWriteStream({
              metadata: {
                  contentType: req.file.mimetype,
              },
          });

          blobStream.on('error', async (err) => {
              console.error('Error al subir el archivo:', err);
              await Material.deleteOne({ _id: savedMaterial._id });
              res.status(500).json({ error: 'Error uploading file.' });
          });

          blobStream.on('finish', async () => {
              const publicUrl = `https://storage.googleapis.com/${bucketName}/${blob.name}`;
              savedMaterial.file = publicUrl;
              const updatedMaterial = await savedMaterial.save();
              res.status(201).json(updatedMaterial);
          });

          blobStream.end(req.file.buffer);
      } catch (error) {
          console.error('Error al guardar el material en la base de datos:', error);
          res.status(500).json({ error: 'Error saving material.' });
      }
  } catch (error) {
      console.error('Error en la solicitud:', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.put('/:id',  upload.single('file'), async (req: Request, res: Response) => {

    const material = await Material.findById(req.params.id)

    if (!material) {
        return res.status(404).json({ error: 'Material not found' })
    }
    // TODO: Check if user is owner in order to update the material
    // const author = material.author
    // const authenticatedUserId = req.user ? req.user.id : null;

    
    // if (authenticatedUserId !== author.toString()) {
    //     return res.status(403).json({ error: 'Unauthorized: You are not the author of this material' });
    // }

    const {
        title,
        description,
        price,
        type,
        purchasers,
    }: MaterialInputs = req.body

    if (!title && !description && !price && !req.file && !type && !purchasers) {
        return res.status(400).json({ error: 'No fields to update provided' })
    }
    



    if (req.file) {
      try{
        if (title) material.title = title
        if (description) material.description = description
        if (price) material.price = price
        if (purchasers) material.purchasers = purchasers
        if (type) material.type = type

        const updatedMaterial = await material.save()

        const newFileName = `${uuidv4()}-${req.file.originalname}`
        const blob = bucket.file(newFileName);

        const blobStream = blob.createWriteStream({
            metadata: {
                contentType: req.file.mimetype,
            },
        });

        blobStream.on('error', (err) => {
            console.error('Error al subir el nuevo archivo:', err)
            return res.status(500).json({ error: 'Error uploading file.' })
        });

        blobStream.on('finish', async () => {
            
            if (material.file) {
                const oldFileName = getFileNameFromUrl(material.file)
                if (oldFileName) {
                  await bucket.file(oldFileName).delete()
                }
            }
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${blob.name}`
            updatedMaterial.file = publicUrl
            const updatedMaterialWithFile = await updatedMaterial.save()
            res.status(200).json(updatedMaterialWithFile)

        })

        blobStream.end(req.file.buffer);
        }
        catch (error) {
          console.error('Error al guardar el material en la base de datos:', error);
          res.status(500).json({ error: 'Error saving material.' });
        }
      
  } else {
      
      if (title) material.title = title;
      if (description) material.description = description;
      if (price) material.price = price;
      if (purchasers) material.purchasers = purchasers
      if (type) material.type = type;

      const updatedMaterial = await material.save();
      return res.status(200).json(updatedMaterial);
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
    const material = await Material.findById(req.params.id);
    if (!material) {
        return res.status(404).json({ error: 'Material not found' });
    }

    // TODO: Check if user is the author of the material
    // const authenticatedUserId = req.user ? req.user.id : null;

    // // Comparar el usuario autenticado con el autor del material
    // if (authenticatedUserId !== material.author.toString()) {
    //     return res.status(403).json({ error: 'Unauthorized: You are not the author of this material' });
    // }

    const fileUrl = material.file;
    const fileName = fileUrl.split('/').pop();

    try {
        if (fileName !== undefined){
            await bucket.file(fileName).delete();
        }
        
    } catch (error) {
        console.error('Error deleting file from bucket:', error);
        return res.status(500).json({ error: 'Error deleting file from bucket' });
    }

    await material.deleteOne();
    return res.status(200).send('Material deleted successfully');
});

export default router

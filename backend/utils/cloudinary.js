import express from 'express';
import multer from 'multer';
import streamifier from 'streamifier';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

// ✅ Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Multer en mémoire (pas de stockage disque)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont autorisées'), false);
  }
});

// ✅ Route : upload d’image via fichier (formData)
router.post('/upload/image', upload.single('image'), async (req, res) => {
  try {
    const folder = req.body.folder || 'pharma-delivery';

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          transformation: [
            { width: 800, height: 600, crop: 'limit' },
            { quality: 'auto' },
            { fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (result) resolve(result);
          else reject(error);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });

    res.status(200).json({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    });
  } catch (error) {
    console.error('❌ Erreur upload Cloudinary:', error);
    res.status(500).json({ error: "Erreur lors de l’upload de l’image" });
  }
});

// ✅ Route : upload d’image en base64
router.post('/upload/image/base64', async (req, res) => {
  try {
    const { imageData, folder = 'pharma-delivery' } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'Image manquante (base64)' });
    }

    const result = await cloudinary.uploader.upload(imageData, {
      folder,
      transformation: [
        { width: 800, height: 600, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    });

    res.status(200).json({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    });
  } catch (error) {
    console.error('❌ Erreur upload base64:', error);
    res.status(500).json({ error: "Erreur lors de l’upload de l’image en base64" });
  }
});

// ✅ Supprimer une image (publicId)
router.delete('/upload/image/:publicId', async (req, res) => {
  try {
    const publicId = req.params.publicId;
    const result = await cloudinary.uploader.destroy(publicId);
    res.status(200).json({ result });
  } catch (error) {
    console.error('❌ Erreur suppression Cloudinary:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de l’image' });
  }
});

export default router;

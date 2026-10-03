import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
const router = express.Router();

const uploadDir = 'public/uploads';
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, {recursive:true});

const storage = multer.diskStorage({
  destination: (req,file,cb)=>cb(null, uploadDir),
  filename: (req,file,cb)=>cb(null, Date.now()+'-'+file.originalname)
});
const upload = multer({storage});

router.post('/', upload.single('image'), (req,res)=>{
  if(!req.file) return res.status(400).json({error:'No file'});
  const url = `/uploads/${req.file.filename}`;
  res.json({success:true, url, fullUrl: `${req.protocol}://${req.get('host')}${url}`});
});

export default router;

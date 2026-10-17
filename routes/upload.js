import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
const router = express.Router();

const uploadDir = 'public/uploads';
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, {recursive:true});

const storage = multer.diskStorage({
  destination: (req,file,cb)=>cb(null, uploadDir),
  filename: (req,file,cb)=>cb(null, Date.now()+'-'+file.originalname)
});
const upload = multer({storage});

// ANCIENNE ROUTE - GARDÉE INTACTE
router.post('/', upload.single('image'), (req,res)=>{
  if(!req.file) return res.status(400).json({error:'No file'});
  const url = `/uploads/${req.file.filename}`;
  res.json({success:true, url, fullUrl: `${req.protocol}://${req.get('host')}${url}`});
});

// NOUVELLE ROUTE - FIXATION IPFS PINATA (PROBLÈME 4)
router.post('/ipfs', upload.single('image'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'No file'});
    const localUrl = `/uploads/${req.file.filename}`;
    const fullLocal = `${req.protocol}://${req.get('host')}${localUrl}`;

    // SI PINATA_JWT NON CONFIGURE, RETOURNE LOCAL
    if(!process.env.PINATA_JWT){
      return res.json({success:true, url: localUrl, fullUrl: fullLocal, gateway: fullLocal, ipfsUrl: fullLocal, warning:'PINATA_JWT manquant sur Render'});
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path));
    form.append('pinataMetadata', JSON.stringify({name: req.file.filename}));
    form.append('pinataOptions', JSON.stringify({cidVersion:1}));

    const pinataRes = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.PINATA_JWT}`
      }
    });

    const IpfsHash = pinataRes.data.IpfsHash;
    const gateway = `https://gateway.pinata.cloud/ipfs/${IpfsHash}`;
    const ipfsUrl = `ipfs://${IpfsHash}`;

    res.json({
      success:true,
      url: gateway,           // pour compatibilité avec ton ancien code
      fullUrl: gateway,
      gateway,
      ipfsUrl,
      IpfsHash,
      localBackup: localUrl
    });

  }catch(e){
    console.error('Pinata error', e.response?.data || e.message);
    // FALLBACK LOCAL SI PINATA FAIL
    if(req.file){
      const url = `/uploads/${req.file.filename}`;
      return res.json({success:true, url, fullUrl: `${req.protocol}://${req.get('host')}${url}`, ipfsUrl: null, error: 'Pinata failed, fallback local'});
    }
    res.status(500).json({error: e.message});
  }
});

export default router;

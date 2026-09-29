import express from 'express'; import Artwork from '../models/Artwork.js';
const router = express.Router();
router.get('/', async(req,res)=>{
  const filter={statut:'validee'}; if(req.query.categorie) filter.categorie=req.query.categorie;
  if(req.query.search) filter.titre={$regex:req.query.search,$options:'i'};
  const sort = req.query.tri==='populaire' ? {votesCount:-1} : {createdAt:-1};
  res.json(await Artwork.find(filter).populate('artiste').sort(sort));
});
router.get('/populaires', async(req,res)=>{ res.json(await Artwork.find({statut:'validee'}).sort({votesCount:-1}).limit(8)); });
router.get('/:id', async(req,res)=>{ res.json(await Artwork.findById(req.params.id).populate('artiste')); });
router.post('/', async(req,res)=>{ res.json(await Artwork.create(req.body)); });
router.put('/:id/valider', async(req,res)=>{ res.json(await Artwork.findByIdAndUpdate(req.params.id,{statut:'validee'},{new:true})); });
export default router;
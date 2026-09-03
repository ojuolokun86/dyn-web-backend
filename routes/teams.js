'use strict';

const express = require('express');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { uploadImage } = require('../config/multer-images');

const router = express.Router();

function cleanTeam(body = {}) {
  return { name: String(body.name || '').trim(), logo_url: String(body.logo_url || '').trim(), email: String(body.email || '').trim().toLowerCase() || null, metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {} };
}

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await db.from('teams').select('*').order('name');
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to load teams' }); }
});

router.post('/', requireAdmin, async (req, res) => {
  const team = cleanTeam(req.body);
  if (!team.name || !team.logo_url) return res.status(400).json({ success: false, error: 'Team name and logo are required' });
  try {
    const { data, error } = await db.from('teams').insert(team).select().single();
    if (error) return res.status(error.code === '23505' ? 409 : 500).json({ success: false, error: error.code === '23505' ? 'A team with this name already exists' : 'Failed to create team' });
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to create team' }); }
});

router.post('/upload-logo', requireAdmin, uploadImage.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'Team logo is required' });
  try {
    const fileName = `tournament-teams/${Date.now()}-${String(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const { data, error } = await db.storage.from('profiles').upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (error) throw error;
    const { data: urlData } = db.storage.from('profiles').getPublicUrl(data.path);
    res.json({ success: true, data: { logo_url: urlData.publicUrl } });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to upload team logo' }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const team = cleanTeam(req.body);
  if (!team.name || !team.logo_url) return res.status(400).json({ success: false, error: 'Team name and logo are required' });
  try {
    const { data, error } = await db.from('teams').update({ ...team, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ success: false, error: 'Team not found' });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to update team' }); }
});

router.get('/categories', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await db.from('league_categories').select('*, league_category_teams(team_id, seed, teams(*))').eq('active', true).order('name');
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to load categories' }); }
});

router.post('/categories', requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'Category name is required' });
  try {
    const { data, error } = await db.from('league_categories').insert({ name, description: String(req.body.description || '').trim() || null }).select().single();
    if (error) return res.status(error.code === '23505' ? 409 : 500).json({ success: false, error: error.code === '23505' ? 'Category already exists' : 'Failed to create category' });
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to create category' }); }
});

router.post('/categories/:id/teams', requireAdmin, async (req, res) => {
  const teamIds = Array.isArray(req.body.team_ids) ? [...new Set(req.body.team_ids)] : [];
  if (!teamIds.length) return res.status(400).json({ success: false, error: 'At least one team is required' });
  try {
    const { data, error } = await db.from('league_category_teams').upsert(teamIds.map(team_id => ({ category_id: req.params.id, team_id }))).select();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: 'Failed to assign teams to category' }); }
});

module.exports = router;

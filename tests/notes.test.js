process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const Note = require('../models/Note');

jest.mock('../models/Note', () => ({
  find: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
  findOne: jest.fn(),
}));

describe('Notes routes', () => {
  const token = jwt.sign({ userId: 'user-123' }, 'test-secret', { expiresIn: '7d' });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  test('GET /notes returns notes for the authenticated user', async () => {
    Note.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([{ _id: 'n1', title: 'Test note' }]),
    });

    const res = await request(app)
      .get('/notes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Note.find).toHaveBeenCalled();
    expect(res.body.notes[0].title).toBe('Test note');
  });

  test('POST /notes creates a note for the authenticated user', async () => {
    const mockNote = {
      _id: 'n1',
      user: 'user-123',
      title: 'Travel plan',
      content: 'Paris',
      color: '#ffffff',
      category: 'General',
    };

    Note.create.mockResolvedValue(mockNote);

    const res = await request(app)
      .post('/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Travel plan',
        content: 'Paris',
      });

    expect(res.statusCode).toBe(201);
    expect(Note.create).toHaveBeenCalledWith({
      user: 'user-123',
      title: 'Travel plan',
      content: 'Paris',
      color: '#ffffff',
      category: 'General',
    });
    expect(res.body.note.title).toBe('Travel plan');
  });

  test('PUT /notes/:noteId updates a note', async () => {
    const updatedNote = {
      _id: 'n1',
      user: 'user-123',
      title: 'Updated title',
      content: 'New content',
    };

    Note.findOneAndUpdate.mockResolvedValue(updatedNote);

    const res = await request(app)
      .put('/notes/n1')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated title', content: 'New content' });

    expect(res.statusCode).toBe(200);
    expect(Note.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'n1', user: 'user-123' },
      { title: 'Updated title', content: 'New content' },
      { new: true }
    );
    expect(res.body.note.title).toBe('Updated title');
  });

  test('DELETE /notes/:noteId deletes a note', async () => {
    Note.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await request(app)
      .delete('/notes/n1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Note deleted successfully');
  });

  test('PATCH /notes/:noteId/pin toggles note pin state', async () => {
    Note.findOne.mockResolvedValue({
      _id: 'n1',
      user: 'user-123',
      isPinned: false,
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .patch('/notes/n1/pin')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Note pinned successfully');
  });

  test('PATCH /notes/:noteId/archive archives a note', async () => {
    Note.findOne.mockResolvedValue({
      _id: 'n1',
      user: 'user-123',
      isPinned: true,
      isArchived: false,
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .patch('/notes/n1/archive')
      .set('Authorization', `Bearer ${token}`)
      .send({ archive: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Note archived successfully');
  });
});

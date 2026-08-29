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
      tags: ['work', 'trip'],
      dueDate: '2026-09-15T12:00:00.000Z',
    };

    Note.create.mockResolvedValue(mockNote);

    const res = await request(app)
      .post('/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Travel plan',
        content: 'Paris',
        tags: ['work', 'trip'],
        dueDate: '2026-09-15T12:00:00.000Z',
      });

    expect(res.statusCode).toBe(201);
    expect(Note.create).toHaveBeenCalledWith({
      user: 'user-123',
      title: 'Travel plan',
      content: 'Paris',
      color: '#ffffff',
      category: 'General',
      tags: ['work', 'trip'],
      dueDate: new Date('2026-09-15T12:00:00.000Z'),
    });
    expect(res.body.note.title).toBe('Travel plan');
    expect(res.body.note.dueDate).toBe('2026-09-15T12:00:00.000Z');
  });

  test('PUT /notes/:noteId updates a note', async () => {
    const updatedNote = {
      _id: 'n1',
      user: 'user-123',
      title: 'Updated title',
      content: 'New content',
      dueDate: '2026-09-20T08:30:00.000Z',
    };

    Note.findOneAndUpdate.mockResolvedValue(updatedNote);

    const res = await request(app)
      .put('/notes/n1')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated title', content: 'New content', dueDate: '2026-09-20T08:30:00.000Z' });

    expect(res.statusCode).toBe(200);
    expect(Note.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'n1', user: 'user-123' },
      { title: 'Updated title', content: 'New content', dueDate: new Date('2026-09-20T08:30:00.000Z') },
      { new: true }
    );
    expect(res.body.note.title).toBe('Updated title');
    expect(res.body.note.dueDate).toBe('2026-09-20T08:30:00.000Z');
  });

  test('DELETE /notes/:noteId soft deletes a note and restore works', async () => {
    Note.findOne.mockResolvedValueOnce({
      _id: 'n1',
      user: 'user-123',
      isDeleted: false,
      deletedAt: null,
      save: jest.fn().mockResolvedValue(true),
    });

    const deleteRes = await request(app)
      .delete('/notes/n1')
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.message).toBe('Note moved to trash successfully');

    Note.findOne.mockResolvedValueOnce({
      _id: 'n1',
      user: 'user-123',
      isDeleted: true,
      deletedAt: new Date(),
      save: jest.fn().mockResolvedValue(true),
    });

    const restoreRes = await request(app)
      .patch('/notes/n1/restore')
      .set('Authorization', `Bearer ${token}`);

    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.body.message).toBe('Note restored successfully');
  });

  test('GET /notes filters by tag and sorts by dueDate', async () => {
    const sortedNotes = [{ _id: 'n1', title: 'Early task', dueDate: '2026-09-12T00:00:00.000Z' }];
    Note.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(sortedNotes),
    });

    const res = await request(app)
      .get('/notes?tag=work&sortBy=dueDate&sortOrder=asc')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Note.find).toHaveBeenCalledWith(expect.objectContaining({
      user: 'user-123',
      $and: expect.arrayContaining([
        { $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] },
        { $or: [{ isArchived: false }, { isArchived: { $exists: false } }] },
        { tags: { $in: ['work'] } }
      ])
    }));
    expect(res.body.notes[0].title).toBe('Early task');
  });

  test('GET /notes includes legacy notes that do not have isDeleted or isArchived fields', async () => {
    const legacyNotes = [{ _id: 'n2', title: 'Legacy note' }];
    Note.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(legacyNotes),
    });

    const res = await request(app)
      .get('/notes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Note.find).toHaveBeenCalledWith(expect.objectContaining({
      user: 'user-123',
      $and: expect.arrayContaining([
        { $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }] },
        { $or: [{ isArchived: false }, { isArchived: { $exists: false } }] }
      ])
    }));
    expect(res.body.notes[0].title).toBe('Legacy note');
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

import { db } from './index';
import { members } from './schema';
import { eq } from 'drizzle-orm';

const SEED_MEMBERS = [
  { id: 'EMP001', name: 'Rajesh Kumar', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP002', name: 'Priya Singh', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP003', name: 'Amit Verma', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP004', name: 'Sneha Reddy', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP005', name: 'Vikram Joshi', join_date: '2024-09-01', policy_start_date: '2024-09-01' },
  { id: 'EMP006', name: 'Kavita Nair', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP007', name: 'Suresh Patil', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP008', name: 'Ravi Menon', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP009', name: 'Anita Desai', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP010', name: 'Deepak Shah', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP011', name: 'Meera Iyer', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP012', name: 'Farhan Sheikh', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP013', name: 'Lakshmi Venkat', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP014', name: 'Arjun Malhotra', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP015', name: 'Nandini Bhat', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP016', name: 'Sanjay Kapoor', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP017', name: 'Pooja Agarwal', join_date: '2024-10-01', policy_start_date: '2024-10-01' },
  { id: 'EMP018', name: 'Karthik Raman', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP019', name: 'Divya Chauhan', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP020', name: 'Rohit Saxena', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP021', name: 'Asha Pillai', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP022', name: 'Manoj Tiwari', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP023', name: 'Rina Das', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP024', name: 'Gaurav Pandey', join_date: '2024-11-15', policy_start_date: '2024-11-15' },
  { id: 'EMP025', name: 'Sunita Hegde', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP026', name: 'Prakash Jha', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP027', name: 'Tanvi Kulkarni', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP028', name: 'Vivek Mishra', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP029', name: 'Neha Srinivasan', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
  { id: 'EMP030', name: 'Aditya Gowda', join_date: '2024-08-15', policy_start_date: '2024-08-15' },
  { id: 'MBR-12345678', name: 'Ravi Kumar', join_date: '2024-01-01', policy_start_date: '2024-01-01' },
];

export async function seedMembers() {
  for (const member of SEED_MEMBERS) {
    const existing = await db.select().from(members).where(eq(members.id, member.id)).get();
    if (!existing) {
      await db.insert(members).values({
        ...member,
        policy_id: 'OPD_ADVANTAGE_2024',
      }).run();
    }
  }
}

// Auto-seed on import — store the promise so routes can await it
export const seedReady = seedMembers().catch(err => {
  console.warn('⚠️ Seed failed (DB may be unavailable):', err);
});

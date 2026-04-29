import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'not_implemented',
    message: 'Daily provider refresh will be implemented in a later task.',
  });
}

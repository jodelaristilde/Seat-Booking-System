// app/api/floor-map/route.ts
import { activeEventId, eventExists } from "@/lib/event";
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET - Fetch the floor map (returns the most recent image)
export async function GET(request: NextRequest) {
  try {
    // ?event=... picks the event (the guest's own event on the phone page)
    const asked = request.nextUrl.searchParams.get("event");
    const eventId = asked && (await eventExists(asked)) ? asked : await activeEventId();
    // Get the most recent image (assuming floor map is the latest uploaded)
    const image = await prisma.image.findFirst({
      where: { eventId },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!image) {
      return NextResponse.json({ image: null }, { status: 200 });
    }

    return NextResponse.json({ image }, { status: 200 });
  } catch (error) {
    console.error('Fetch floor map error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch floor map' },
      { status: 500 }
    );
  }
}

// POST - Upload a new floor map
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, data, mimeType, size } = body;
    // Optional: the clean picture, kept so names can be rewritten later
    const original =
      typeof body.original === 'string' && body.original.startsWith('data:image/')
        ? body.original
        : null;

    // Validate required fields
    if (!filename || !data || !mimeType || !size) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!mimeType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    if (size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Delete existing floor map(s) if any
    const eventId = await activeEventId();
    await prisma.image.deleteMany({ where: { eventId } });

    // Create new floor map
    const image = await prisma.image.create({
      data: {
        eventId,
        filename,
        data,
        mimeType,
        size,
        original,
      },
    });

    return NextResponse.json(
      {
        message: 'Floor map uploaded successfully',
        image: {
          id: image.id,
          filename: image.filename,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Upload floor map error:', error);
    return NextResponse.json(
      { error: 'Failed to upload floor map' },
      { status: 500 }
    );
  }
}
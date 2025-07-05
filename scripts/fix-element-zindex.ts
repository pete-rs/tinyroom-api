import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkElementZIndex() {
  try {
    // Get all rooms with elements
    const rooms = await prisma.room.findMany({
      include: {
        _count: {
          select: { elements: true }
        }
      }
    });

    console.log(`Total rooms: ${rooms.length}`);
    let totalElements = 0;
    let roomsWithOverlappingZIndex = 0;

    for (const room of rooms) {
      if (room._count.elements > 0) {
        const elements = await prisma.element.findMany({
          where: {
            roomId: room.id,
            deletedAt: null
          },
          select: {
            id: true,
            zIndex: true,
            createdAt: true,
            type: true
          },
          orderBy: {
            zIndex: 'asc'
          }
        });

        totalElements += elements.length;

        // Check for duplicate z-index values
        const zIndexCounts = new Map<number, number>();
        let hasDuplicates = false;
        
        elements.forEach(el => {
          const count = (zIndexCounts.get(el.zIndex) || 0) + 1;
          zIndexCounts.set(el.zIndex, count);
          if (count > 1) hasDuplicates = true;
        });

        if (hasDuplicates) {
          roomsWithOverlappingZIndex++;
          console.log(`\n⚠️ Room "${room.name}" has overlapping z-index values!`);
          console.log(`  Elements: ${elements.length}`);
          console.log(`  Z-index values:`, [...zIndexCounts.entries()].map(([z, count]) => `${z}(×${count})`).join(', '));
          
          // Fix by reassigning sequential z-index based on creation order
          console.log(`  Fixing z-index values...`);
          
          const sortedElements = elements.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          for (let i = 0; i < sortedElements.length; i++) {
            await prisma.element.update({
              where: { id: sortedElements[i].id },
              data: { zIndex: i }
            });
          }
          
          console.log(`  ✅ Fixed! Elements now have z-index 0 to ${sortedElements.length - 1}`);
        } else if (elements.length > 0) {
          console.log(`\n✅ Room "${room.name}":`);
          console.log(`  Elements: ${elements.length}`);
          console.log(`  Z-index range: ${elements[0].zIndex} to ${elements[elements.length - 1].zIndex}`);
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`  Total elements: ${totalElements}`);
    console.log(`  Rooms with overlapping z-index: ${roomsWithOverlappingZIndex}`);
    console.log(`\nAll elements now have proper z-index values!`);

  } catch (error) {
    console.error('Error checking z-index:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkElementZIndex();
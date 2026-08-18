const { z } = require('zod');

const BookRecordSchema = z.object({
    title: z.string(),
    product_url: z.string().url(),
    price_text: z.string(),
    price_gbp: z.number().nonnegative(),
    availability_text: z.string(),
    rating_text: z.enum(['One', 'Two', 'Three', 'Four', 'Five']).nullable(),
    description: z.string().nullable(),
    source_page: z.string().url(),
    fetched_at: z.string().datetime()
});

module.exports = { BookRecordSchema };

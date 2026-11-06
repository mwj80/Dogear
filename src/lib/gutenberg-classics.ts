/** Curated public-domain classics from Project Gutenberg. IDs are the numbers in the EPUB URL. */
export const GUTENBERG_CLASSICS = [
  { id: 11, slug: "alice", title: "Alice’s Adventures in Wonderland", author: "Lewis Carroll", genre: "Fantasy" },
  { id: 12, slug: "looking-glass", title: "Through the Looking-Glass", author: "Lewis Carroll", genre: "Fantasy" },
  { id: 16, slug: "peter-pan", title: "Peter Pan", author: "J. M. Barrie", genre: "Fantasy" },
  { id: 55, slug: "oz", title: "The Wonderful Wizard of Oz", author: "L. Frank Baum", genre: "Fantasy" },
  { id: 120, slug: "treasure", title: "Treasure Island", author: "Robert Louis Stevenson", genre: "Adventure" },
  { id: 1251, slug: "jungle-book", title: "The Jungle Book", author: "Rudyard Kipling", genre: "Adventure" },
  { id: 514, slug: "little-women", title: "Little Women", author: "Louisa May Alcott", genre: "Classic" },
  { id: 1661, slug: "sherlock", title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle", genre: "Mystery" },
  { id: 84, slug: "frankenstein", title: "Frankenstein", author: "Mary Shelley", genre: "Horror" },
  { id: 2701, slug: "moby-dick", title: "Moby Dick", author: "Herman Melville", genre: "Adventure" },
  { id: 1342, slug: "pride", title: "Pride and Prejudice", author: "Jane Austen", genre: "Classic" },
  { id: 46, slug: "christmas-carol", title: "A Christmas Carol", author: "Charles Dickens", genre: "Classic" },
  { id: 76, slug: "huckleberry", title: "Adventures of Huckleberry Finn", author: "Mark Twain", genre: "Adventure" },
  { id: 74, slug: "tom-sawyer", title: "The Adventures of Tom Sawyer", author: "Mark Twain", genre: "Adventure" },
  { id: 345, slug: "dracula", title: "Dracula", author: "Bram Stoker", genre: "Horror" },
  { id: 98, slug: "call-of-the-wild", title: "The Call of the Wild", author: "Jack London", genre: "Adventure" },
  { id: 236, slug: "jungle-book-2", title: "The Second Jungle Book", author: "Rudyard Kipling", genre: "Adventure" },
  { id: 43, slug: "jekyll-hyde", title: "The Strange Case of Dr. Jekyll and Mr. Hyde", author: "Robert Louis Stevenson", genre: "Horror" },
  { id: 1080, slug: "secret-garden", title: "The Secret Garden", author: "Frances Hodgson Burnett", genre: "Classic" }
] as const;

export const BOOK_GENRES = ["Adventure", "Classic", "Fantasy", "Horror", "Mystery"] as const;

export function gutenbergEpubPath(id: number) {
  const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`;
  return `/api/epub?url=${encodeURIComponent(url)}`;
}

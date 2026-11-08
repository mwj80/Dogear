/** Curated public-domain classics from Project Gutenberg. IDs are the numbers in the EPUB URL. */
export const GUTENBERG_CLASSICS = [
  { id: 11, slug: "alice", title: "Alice’s Adventures in Wonderland", author: "Lewis Carroll", genre: "Fantasy", teaser: "Alice follows a White Rabbit down a rabbit hole into a world of talking animals and impossible logic." },
  { id: 12, slug: "looking-glass", title: "Through the Looking-Glass", author: "Lewis Carroll", genre: "Fantasy", teaser: "Alice steps through a mirror into a chessboard world of chess pieces and nonsense verse." },
  { id: 16, slug: "peter-pan", title: "Peter Pan", author: "J. M. Barrie", genre: "Fantasy", teaser: "The boy who never grows up leads Wendy and her brothers to Neverland." },
  { id: 55, slug: "oz", title: "The Wonderful Wizard of Oz", author: "L. Frank Baum", genre: "Fantasy", teaser: "Dorothy and her dog Toto are swept to Oz and follow the yellow brick road." },
  { id: 120, slug: "treasure", title: "Treasure Island", author: "Robert Louis Stevenson", genre: "Adventure", teaser: "Young Jim Hawkins finds a pirate map and sails for buried treasure." },
  { id: 1251, slug: "jungle-book", title: "The Jungle Book", author: "Rudyard Kipling", genre: "Adventure", teaser: "Mowgli is raised by wolves and learns the laws of the jungle." },
  { id: 514, slug: "little-women", title: "Little Women", author: "Louisa May Alcott", genre: "Classic", teaser: "The March sisters grow up through love, loss, and ambition in Civil War America." },
  { id: 1661, slug: "sherlock", title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle", genre: "Mystery", teaser: "Twelve short cases of the famous detective and Dr. Watson." },
  { id: 84, slug: "frankenstein", title: "Frankenstein", author: "Mary Shelley", genre: "Horror", teaser: "A scientist creates a living being and faces the consequences." },
  { id: 2701, slug: "moby-dick", title: "Moby Dick", author: "Herman Melville", genre: "Adventure", teaser: "Captain Ahab obsessively hunts the white whale that took his leg." },
  { id: 1342, slug: "pride", title: "Pride and Prejudice", author: "Jane Austen", genre: "Classic", teaser: "Elizabeth Bennet navigates pride, prejudice, and marriage in Regency England." },
  { id: 46, slug: "christmas-carol", title: "A Christmas Carol", author: "Charles Dickens", genre: "Classic", teaser: "Ebenezer Scrooge is visited by three ghosts on Christmas Eve." },
  { id: 76, slug: "huckleberry", title: "Adventures of Huckleberry Finn", author: "Mark Twain", genre: "Adventure", teaser: "Huck and Jim raft down the Mississippi River." },
  { id: 74, slug: "tom-sawyer", title: "The Adventures of Tom Sawyer", author: "Mark Twain", genre: "Adventure", teaser: "Tom Sawyer’s mischief, friendship, and treasure hunting on the Mississippi." },
  { id: 345, slug: "dracula", title: "Dracula", author: "Bram Stoker", genre: "Horror", teaser: "Count Dracula travels from Transylvania to England in search of new victims." },
  { id: 98, slug: "call-of-the-wild", title: "The Call of the Wild", author: "Jack London", genre: "Adventure", teaser: "A domesticated dog is stolen and must survive in the Yukon wilderness." },
  { id: 236, slug: "jungle-book-2", title: "The Second Jungle Book", author: "Rudyard Kipling", genre: "Adventure", teaser: "More stories of Mowgli and the animals of the jungle." },
  { id: 43, slug: "jekyll-hyde", title: "The Strange Case of Dr. Jekyll and Mr. Hyde", author: "Robert Louis Stevenson", genre: "Horror", teaser: "A doctor’s experiment unleashes a darker side of himself." },
  { id: 1080, slug: "secret-garden", title: "The Secret Garden", author: "Frances Hodgson Burnett", genre: "Classic", teaser: "An orphaned girl discovers a locked garden and brings it back to life." }
] as const;

export const BOOK_GENRES = ["Adventure", "Classic", "Fantasy", "Horror", "Mystery"] as const;

export function gutenbergEpubPath(id: number) {
  const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`;
  return `/api/epub?url=${encodeURIComponent(url)}`;
}

export function gutenbergCoverUrl(id: number) {
  return `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;
}

const bySlug = new Map(GUTENBERG_CLASSICS.map((b) => [b.slug, b]));

export function coverAndTeaserForSlug(slug: string): { cover?: string; teaser?: string } {
  const classic = bySlug.get(slug as typeof GUTENBERG_CLASSICS[number]["slug"]);
  if (classic) {
    return { cover: gutenbergCoverUrl(classic.id), teaser: classic.teaser };
  }
  const match = slug.match(/^gutenberg-(\d+)$/);
  if (match) {
    return { cover: gutenbergCoverUrl(Number(match[1])) };
  }
  return {};
}

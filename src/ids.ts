// Speakable muse IDs: adjective-noun-NN, e.g. brave-otter-42.

const ADJECTIVES = [
  "brave", "quiet", "swift", "amber", "cobalt", "drowsy", "eager", "frosty",
  "golden", "hollow", "ivory", "jolly", "keen", "lunar", "misty", "nimble",
  "onyx", "patient", "quaint", "rustic", "solar", "tidal", "urban", "velvet",
  "witty", "xenial", "yearning", "zealous", "crisp", "dapper", "ember", "feral",
  "glassy", "hearty", "inked", "jaded", "kindly", "lofty", "mellow", "noble",
];

const NOUNS = [
  "otter", "falcon", "badger", "heron", "mole", "newt", "owl", "panda",
  "quail", "raven", "salamander", "toad", "urchin", "vole", "wren", "yak",
  "zebra", "albatross", "beaver", "cricket", "dove", "egret", "finch", "gecko",
  "hare", "ibis", "jay", "koala", "lark", "magpie", "narwhal", "ocelot",
  "puffin", "robin", "sparrow", "turtle", "viper", "walrus", "xerus", "yeti",
];

function rand<T>(arr: T[]): T {
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

export function generateId(): string {
  const n = 10 + Math.floor(Math.random() * 90); // 10-99
  return `${rand(ADJECTIVES)}-${rand(NOUNS)}-${n}`;
}

export function isValidId(id: string): boolean {
  return /^[a-z]+-[a-z]+-\d{2}$/.test(id);
}

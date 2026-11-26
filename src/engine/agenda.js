function earlier(a, b) {
  return a.tick - b.tick || a.phase - b.phase || a.order - b.order ||
    (a.secondOrder ?? 0) - (b.secondOrder ?? 0);
}

export class Agenda {
  #items = [];

  get size() {
    return this.#items.length;
  }

  peek() {
    return this.#items[0];
  }

  push(item) {
    const items = this.#items;
    let index = items.length;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (earlier(item, items[parent]) >= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }

  pop() {
    const items = this.#items;
    const first = items[0];
    const last = items.pop();
    if (items.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < items.length) {
      let child = index * 2 + 1;
      if (child + 1 < items.length && earlier(items[child + 1], items[child]) < 0) child++;
      if (earlier(last, items[child]) <= 0) break;
      items[index] = items[child];
      index = child;
    }
    items[index] = last;
    return first;
  }
}

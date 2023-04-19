export function groupByContentTopic<T extends { contentTopic: string }>(
  values: readonly T[]
): Map<string, Array<T>> {
  const groupedDecoders = new Map();
  values.forEach((value) => {
    let decs = groupedDecoders.get(value.contentTopic);
    if (!decs) {
      groupedDecoders.set(value.contentTopic, []);
      decs = groupedDecoders.get(value.contentTopic);
    }
    decs.push(value);
  });
  return groupedDecoders;
}

const AUTO_LINE = /^Loading type: .+\. Call before delivery: (Yes|No)\.$/

/**
 * Special delivery instructions with the wireframe's auto first line (`syncAutoInstructions`): loading type and
 * call-before always reach BC there, whatever else the customer types below it.
 */
export function withAutoLine(text: string, loadingType: string, callBefore: boolean): string {
  const lines = text.split('\n')
  const rest = AUTO_LINE.test(lines[0].trim()) ? lines.slice(1).join('\n') : text
  const auto = `Loading type: ${loadingType}. Call before delivery: ${callBefore ? 'Yes' : 'No'}.`
  return rest ? `${auto}\n${rest}` : auto
}

// The auto line at the start of the text, with anything typed after it on the same line kept as the customer's text.
const AUTO_LINE = /^\s*Loading type: .*?\. Call before delivery: (Yes|No)\.[ \t]*\n?/

/**
 * Special delivery instructions with the wireframe's auto first line (`syncAutoInstructions`): loading type and
 * call-before always reach BC there, whatever else the customer types below it.
 */
export function withAutoLine(text: string, loadingType: string, callBefore: boolean): string {
  const rest = text.replace(AUTO_LINE, '')
  const auto = `Loading type: ${loadingType}. Call before delivery: ${callBefore ? 'Yes' : 'No'}.`
  return rest ? `${auto}\n${rest}` : auto
}

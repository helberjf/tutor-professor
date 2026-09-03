/** CPF: máscara enquanto digita e validação dos dois dígitos verificadores. */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 9);
  const part4 = digits.slice(9, 11);

  if (digits.length <= 3) return part1;
  if (digits.length <= 6) return `${part1}.${part2}`;
  if (digits.length <= 9) return `${part1}.${part2}.${part3}`;
  return `${part1}.${part2}.${part3}-${part4}`;
}

export function validateCpf(cpf: string): boolean {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return false;
  // Sequências de um dígito só passam nos dois verificadores, então são
  // rejeitadas explicitamente.
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (length: number) => {
    const total = digits
      .slice(0, length)
      .split('')
      .reduce((accumulator, digit, index) => accumulator + Number(digit) * (length + 1 - index), 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

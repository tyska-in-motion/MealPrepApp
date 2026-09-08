export type ScalingType = "LINEAR" | "FIXED" | "STEP" | "FORMULA";

export type StepThreshold = {
  minServings: number;
  maxServings?: number | null;
  amount: number;
};

export type ScalableIngredient = {
  baseAmount: number;
  scalingType?: ScalingType | null;
  scalingFormula?: string | null;
  stepThresholds?: StepThreshold[] | null;
};


export type IngredientEdibleSettings = {
  ediblePercentage?: number | null;
  increasePurchaseForWaste?: boolean | null;
};

export function getEdibleFraction(ingredient?: IngredientEdibleSettings | null): number {
  const percentage = Number(ingredient?.ediblePercentage ?? 100);
  if (!Number.isFinite(percentage) || percentage <= 0) return 1;
  return Math.min(percentage, 100) / 100;
}

export function calculateNutritionAmount(amount: number, ingredient?: IngredientEdibleSettings | null): number {
  const normalizedAmount = Number.isFinite(Number(amount)) && Number(amount) > 0 ? Number(amount) : 0;
  if (ingredient?.increasePurchaseForWaste) {
    return normalizedAmount;
  }
  return normalizedAmount * getEdibleFraction(ingredient);
}

export function calculatePurchaseAmount(amount: number, ingredient?: IngredientEdibleSettings | null): number {
  const normalizedAmount = Number.isFinite(Number(amount)) && Number(amount) > 0 ? Number(amount) : 0;
  if (!ingredient?.increasePurchaseForWaste) {
    return normalizedAmount;
  }

  const edibleFraction = getEdibleFraction(ingredient);
  return edibleFraction > 0 ? normalizedAmount / edibleFraction : normalizedAmount;
}

const ALLOWED_VARIABLES = new Set(["scaleFactor", "newServings", "baseServings"]);

function tokenizeFormula(formula: string): string[] {
  const cleaned = formula.replace(/\s+/g, "");
  if (!cleaned) throw new Error("Formula is empty");

  const tokens = cleaned.match(/[A-Za-z_][A-Za-z0-9_]*|\d*\.?\d+|[()+\-*/]/g);
  if (!tokens || tokens.join("") !== cleaned) {
    throw new Error("Formula contains invalid tokens");
  }
  return tokens;
}

function toRpn(tokens: string[]): string[] {
  const output: string[] = [];
  const stack: string[] = [];
  const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

  let previousToken: string | undefined;
  for (const token of tokens) {
    const isNumber = /^\d*\.?\d+$/.test(token);
    const isVariable = /^[A-Za-z_][A-Za-z0-9_]*$/.test(token);

    if (isNumber || isVariable) {
      output.push(token);
      previousToken = token;
      continue;
    }

    if (token === "(") {
      stack.push(token);
      previousToken = token;
      continue;
    }

    if (token === ")") {
      while (stack.length && stack[stack.length - 1] !== "(") {
        output.push(stack.pop()!);
      }
      if (stack.pop() !== "(") {
        throw new Error("Mismatched parentheses");
      }
      previousToken = token;
      continue;
    }

    if (token in precedence) {
      if ((token === "-" || token === "+") && (!previousToken || ["(", "+", "-", "*", "/"].includes(previousToken))) {
        output.push("0");
      }
      while (stack.length && stack[stack.length - 1] in precedence && precedence[stack[stack.length - 1]] >= precedence[token]) {
        output.push(stack.pop()!);
      }
      stack.push(token);
      previousToken = token;
      continue;
    }

    throw new Error("Invalid formula token");
  }

  while (stack.length) {
    const op = stack.pop()!;
    if (op === "(") throw new Error("Mismatched parentheses");
    output.push(op);
  }

  return output;
}

function evalRpn(rpn: string[], variables: Record<string, number>): number {
  const stack: number[] = [];
  for (const token of rpn) {
    if (/^\d*\.?\d+$/.test(token)) {
      stack.push(Number(token));
      continue;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      if (!ALLOWED_VARIABLES.has(token)) {
        throw new Error(`Variable ${token} is not allowed`);
      }
      stack.push(variables[token]);
      continue;
    }

    const right = stack.pop();
    const left = stack.pop();
    if (left === undefined || right === undefined) {
      throw new Error("Invalid formula structure");
    }

    switch (token) {
      case "+":
        stack.push(left + right);
        break;
      case "-":
        stack.push(left - right);
        break;
      case "*":
        stack.push(left * right);
        break;
      case "/":
        if (right === 0) throw new Error("Division by zero");
        stack.push(left / right);
        break;
      default:
        throw new Error("Unknown operator");
    }
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0])) {
    throw new Error("Formula did not evaluate to a finite number");
  }

  return stack[0];
}

export function evaluateScalingFormula(formula: string, variables: Record<string, number>): number {
  const tokens = tokenizeFormula(formula);
  const rpn = toRpn(tokens);
  return evalRpn(rpn, variables);
}

export function calculateScaledAmount(
  ingredient: ScalableIngredient,
  newServings: number,
  baseServings: number,
): number {
  const baseAmount = Number((ingredient as any).baseAmount ?? (ingredient as any).amount ?? 0) || 0;
  const scaleFactor = newServings / baseServings;
  const scalingType = ingredient.scalingType || "LINEAR";

  switch (scalingType) {
    case "FIXED": {
      // FIXED means: keep exactly the configured amount, independent from servings.
      // This is especially important for frequent addons selected per person.
      return baseAmount;
    }
    case "STEP": {
      const thresholds = (ingredient.stepThresholds || [])
        .map((threshold) => ({
          minServings: Number(threshold.minServings) || 0,
          maxServings: threshold.maxServings == null ? Number.POSITIVE_INFINITY : Number(threshold.maxServings),
          amount: Number(threshold.amount),
        }))
        .filter((threshold) => Number.isFinite(threshold.amount) && threshold.maxServings >= threshold.minServings)
        .sort((a, b) => {
          if (a.maxServings !== b.maxServings) return a.maxServings - b.maxServings;
          return a.minServings - b.minServings;
        });

      const matched = thresholds.find((threshold, index) => {
        const min = Number(threshold.minServings) || 0;
        const max = threshold.maxServings == null ? Number.POSITIVE_INFINITY : Number(threshold.maxServings);
        const isFirstThreshold = index === 0;
        const lowerBoundMatches = isFirstThreshold ? newServings >= min : newServings > min;
        return lowerBoundMatches && newServings <= max;
      });
      return matched ? Number(matched.amount) || baseAmount : baseAmount;
    }
    case "FORMULA": {
      if (!ingredient.scalingFormula) return baseAmount * scaleFactor;
      try {
        return evaluateScalingFormula(ingredient.scalingFormula, {
          scaleFactor,
          newServings,
          baseServings,
        });
      } catch {
        return baseAmount * scaleFactor;
      }
    }
    case "LINEAR":
    default:
      return baseAmount * scaleFactor;
  }
}

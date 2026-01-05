import ast

with open('app/llm_proxy/proxy.py', 'r') as f:
    code = f.read()

tree = ast.parse(code)

class ComplexityAnalyzer(ast.NodeVisitor):
    def __init__(self):
        self.functions = []
        self.current_class = None
    
    def visit_ClassDef(self, node):
        self.current_class = node.name
        self.generic_visit(node)
        self.current_class = None
    
    def visit_FunctionDef(self, node):
        complexity = 1
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.ExceptHandler)):
                complexity += 1
            elif isinstance(child, ast.BoolOp):
                complexity += len(child.values) - 1
        
        name = f'{self.current_class}.{node.name}' if self.current_class else node.name
        self.functions.append({
            'name': name,
            'complexity': complexity,
            'lines': node.end_lineno - node.lineno + 1,
            'start_line': node.lineno
        })
        self.generic_visit(node)
    
    visit_AsyncFunctionDef = visit_FunctionDef

analyzer = ComplexityAnalyzer()
analyzer.visit(tree)

print('Function Complexity Analysis:')
print('-' * 70)
header = f"{'Function':<45} {'CC':>5} {'Lines':>6} {'Start':>6}"
print(header)
print('-' * 70)

for func in sorted(analyzer.functions, key=lambda x: x['complexity'], reverse=True):
    row = f"{func['name']:<45} {func['complexity']:>5} {func['lines']:>6} {func['start_line']:>6}"
    print(row)

print('-' * 70)
print(f'Total functions: {len(analyzer.functions)}')
print(f'Average complexity: {sum(f["complexity"] for f in analyzer.functions) / len(analyzer.functions):.2f}')

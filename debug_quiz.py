#!/usr/bin/env python3
"""
Debug script to check quiz correct_option format
"""
import json
import sys
sys.path.insert(0, '/mnt/c/Users/default.LAPTOP-K8F2QHAF/projects/english-kids-tutor/apps/api')

# Test if correct_option is an index or text
test_quiz = {
    "id": 1,
    "question": "Por que o Vite é rápido?",
    "options": [
        "Porque tem muito cache",
        "Porque usa ES modules natively",
        "Porque é escrito em Rust",
        "Porque não faz bundle"
    ],
    "correct_option": "Porque usa ES modules natively",  # Should be text
    "explanation": "Vite usa ES modules nativos"
}

# Simular o que a IA poderia estar retornando
print("Expected format (text):", test_quiz["correct_option"])
print("Option at index 0:", test_quiz["options"][0])
print("Is match?", test_quiz["correct_option"] in test_quiz["options"])

# Teste se poderia estar retornando índice
test_quiz_with_index = {
    **test_quiz,
    "correct_option": 1  # Erroneously an index
}
print("\nIf correct_option is index 1:")
print("correct_option:", test_quiz_with_index["correct_option"])
print("Type:", type(test_quiz_with_index["correct_option"]))
print("In options?", test_quiz_with_index["correct_option"] in test_quiz_with_index["options"])

# Check what happens with string index
test_quiz_with_str_index = {
    **test_quiz,
    "correct_option": "1"  # String index
}
print("\nIf correct_option is string '1':")
print("correct_option:", test_quiz_with_str_index["correct_option"])
print("Type:", type(test_quiz_with_str_index["correct_option"]))
print("In options?", test_quiz_with_str_index["correct_option"] in test_quiz_with_str_index["options"])

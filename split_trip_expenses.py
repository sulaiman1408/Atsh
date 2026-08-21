#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
برنامج تقسيم مصاريف الرحلة
---------------------------
- يدخل كل شخص اسمه والمبلغ الذي دفعه.
- بعد إدخال الجميع، يحسب البرنامج إجمالي المصروف وحصة كل شخص (الإجمالي ÷ عدد الأشخاص).
- يحدد من له فائض (دفع أكثر من حصته) ومن عليه نقص (دفع أقل من حصته).
- يطبع أقل عدد ممكن من التحويلات المالية لتسوية الحساب بين الجميع (من يدفع لمن وكم).
"""

from dataclasses import dataclass


@dataclass
class Person:
    name: str
    paid: float
    balance: float = 0.0  # موجب = له عند الآخرين، سالب = عليه للآخرين


def read_participants() -> list[Person]:
    while True:
        try:
            count = int(input("كم عدد الأشخاص المشاركين في الرحلة؟ "))
            if count < 2:
                print("يجب أن يكون عدد المشاركين اثنين على الأقل.\n")
                continue
            break
        except ValueError:
            print("الرجاء إدخال رقم صحيح.\n")

    people: list[Person] = []
    for i in range(1, count + 1):
        name = input(f"اسم الشخص رقم {i}: ").strip() or f"شخص {i}"
        while True:
            try:
                paid = float(input(f"كم دفع {name}؟ "))
                if paid < 0:
                    print("لا يمكن أن يكون المبلغ سالبًا.\n")
                    continue
                break
            except ValueError:
                print("الرجاء إدخال مبلغ صحيح.\n")
        people.append(Person(name=name, paid=paid))

    return people


def compute_balances(people: list[Person]) -> float:
    total = sum(p.paid for p in people)
    share = total / len(people)
    for p in people:
        p.balance = round(p.paid - share, 2)
    return total, share


def settle_debts(people: list[Person]) -> list[tuple[str, str, float]]:
    """
    خوارزمية جشعة: نطابق في كل خطوة من عليه أكبر نقص مع من له أكبر فائض
    للحصول على أقل عدد ممكن من التحويلات.
    """
    debtors = sorted([p for p in people if p.balance < -0.01], key=lambda p: p.balance)
    creditors = sorted([p for p in people if p.balance > 0.01], key=lambda p: -p.balance)

    transactions = []
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        debtor = debtors[i]
        creditor = creditors[j]
        amount = min(-debtor.balance, creditor.balance)
        amount = round(amount, 2)
        if amount > 0:
            transactions.append((debtor.name, creditor.name, amount))
            debtor.balance = round(debtor.balance + amount, 2)
            creditor.balance = round(creditor.balance - amount, 2)

        if abs(debtor.balance) < 0.01:
            i += 1
        if abs(creditor.balance) < 0.01:
            j += 1

    return transactions


def main() -> None:
    print("=== برنامج تقسيم مصاريف الرحلة ===\n")
    people = read_participants()
    total, share = compute_balances(people)

    print("\n--- الملخص ---")
    print(f"إجمالي المصروف: {total:.2f}")
    print(f"حصة كل شخص: {share:.2f}\n")

    for p in people:
        if p.balance > 0.01:
            status = f"له فائض {p.balance:.2f} (دفع أكثر من حصته)"
        elif p.balance < -0.01:
            status = f"عليه نقص {abs(p.balance):.2f} (دفع أقل من حصته)"
        else:
            status = "دفع حصته بالضبط"
        print(f"{p.name}: دفع {p.paid:.2f} — {status}")

    transactions = settle_debts(people)

    print("\n--- التسوية: من يدفع لمن ---")
    if not transactions:
        print("لا حاجة لأي تحويلات، الجميع دفع حصته بالضبط.")
    else:
        for debtor, creditor, amount in transactions:
            print(f"{debtor} يدفع {amount:.2f} إلى {creditor}")


if __name__ == "__main__":
    main()

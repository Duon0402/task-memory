import React, {useState} from "react";
import { View, TextInput, Button } from "react-native";

export function ExpenseForm({ onSubmit }: { onSubmit: (v: { amount: string; note: string; fileIds: string[] }) => void }) {
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("");
    const [fileIds, setFileIds] = useState<string[]>([]);

    return (
        <View>
            <TextInput value={amount} onChangeText={setAmount} placeholder="Số tiền" keyboardType="numeric" />
            <TextInput value={note} onChangeText={setNote} placeholder="Ghi chú" />
            <Button title="Lưu" onPress={() => onSubmit({ amount, note, fileIds })} />
        </View>
    );
}

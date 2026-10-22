import { Ionicons } from "@expo/vector-icons";
import type { StyleProp, TextStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

export type VerificationType = "general" | "grey" | "government" | "media" | "business";

const colors: Record<VerificationType, string> = {
  general: "#1689f8",
  grey: "#7b8798",
  government: "#e89a18",
  media: "#8b5cf6",
  business: "#0aa79b",
};
export const verificationColor=(type?:VerificationType|null)=>type?colors[type]:colors.general;

export function VerifiedName({name,type,size=17,textStyle,numberOfLines}:{name:string;type?:VerificationType|null;size?:number;textStyle?:StyleProp<TextStyle>;numberOfLines?:number}) {
  return <View style={styles.row}><Text numberOfLines={numberOfLines} style={[styles.name,textStyle]}>{name}</Text>{type?<Ionicons accessibilityLabel={`${type} verified account`} name="checkmark-circle" size={size} color={verificationColor(type)}/>:null}</View>;
}

const styles=StyleSheet.create({row:{flexDirection:"row",alignItems:"center",gap:4,minWidth:0},name:{flexShrink:1}});

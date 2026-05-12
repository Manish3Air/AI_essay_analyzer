import mongoose from "mongoose";

// ✅ Sub-schema for each annotation (correction, note, etc.)
const annotationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      default: "note", // e.g. "grammar", "spelling", "style"
    },
    original: {
      type: String,
      default: "",
    },
    corrected: {
      type: String,
      default: "",
    },
    note: {
      type: String,
      default: "",
    },
    accepted: {
      type: Boolean,
      default: null,
    },
  },
  { _id: false } // prevents creation of unnecessary IDs inside array
);

const grammarSchema = new mongoose.Schema(
  {
    sentence: String,
    corrected: String,
  }
);

// ✅ Main Essay schema
const essaySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    default: "Untitled Essay",
  },
  raw_text: {
    type: String,
    required: true,
  },
  corrected_text: {
    type: String,
    default: "",
  },
  annotations: {
    type: [annotationSchema],
    default: [],
  },
  // grammar_issues: {
  //   type: [String],
  //   default: [],
  // },
  grammar_issues: [
  {
    sentence: { type: String },
    corrected: { type: String },
    issues: [
      {
        type: {
          type: String,   // "addition" | "removal"
          enum: ["addition", "removal"],
          required: true,
        },
        text: {
          type: String,
          required: true,
        }
      }
    ]
  }
],

  suggestions: {
    type: [String],
    default: [],
  },
  score: {
    type: Number,
    min: 0,
    max: 10,
    default: 0,
  },
  readability: {
    type: String,
    default: "Unknown",
  },
  tone: {
    type: String,
    default: "Neutral",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ✅ Optional: Auto-clean string annotations (in case an AI provider returns strings)
essaySchema.pre("validate", function (next) {
  if (Array.isArray(this.annotations)) {
    this.annotations = this.annotations.map((a) =>
      typeof a === "string"
        ? { type: "note", original: "", corrected: "", note: a, accepted: null }
        : a
    );
  }
  next();
});

export default mongoose.model("Essay", essaySchema);
